const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.5";

type OpenAIResponseContent = {
  type?: string;
  text?: string;
};

type OpenAIResponseOutputItem = {
  type?: string;
  content?: OpenAIResponseContent[];
};

type OpenAIResponsesPayload = {
  model?: string;
  input: {
    role: "system" | "developer" | "user" | "assistant";
    content: string;
  }[];
  reasoning?: {
    effort?: "low" | "medium" | "high" | "xhigh";
  };
  text?: {
    format?: {
      type: "text" | "json_object";
    };
    verbosity?: "low" | "medium" | "high";
  };
  max_output_tokens?: number;
};

type OpenAIResponsesResult = {
  status?: string;
  incomplete_details?: {
    reason?: string;
  };
  output_text?: string;
  output?: OpenAIResponseOutputItem[];
  usage?: unknown;
  error?: {
    message?: string;
  };
};

export function getOpenAIReportModel() {
  return process.env.OPENAI_REPORT_MODEL || DEFAULT_OPENAI_MODEL;
}

export function getOpenAIReportReasoningEffort() {
  const configured = process.env.OPENAI_REPORT_REASONING_EFFORT;
  if (configured === "low" || configured === "medium" || configured === "high" || configured === "xhigh") {
    return configured;
  }

  const model = getOpenAIReportModel().toLowerCase();
  if (model.includes("mini") || model.includes("nano")) return "low";
  return "high";
}

function extractOutputText(data: OpenAIResponsesResult) {
  if (data.output_text) return data.output_text;

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function createOpenAIResponse(
  payload: Omit<OpenAIResponsesPayload, "model"> & { model?: string }
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: payload.model || getOpenAIReportModel(),
      ...payload,
    }),
  });

  const text = await res.text();
  let data: OpenAIResponsesResult = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text) as OpenAIResponsesResult;
    } catch {
      throw new Error(`OpenAI returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }
  }

  if (!res.ok) {
    throw new Error(data.error?.message || `OpenAI API error (${res.status})`);
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    const status = data.status || "unknown";
    const reason = data.incomplete_details?.reason || "unknown";
    const usage = data.usage ? ` Usage: ${JSON.stringify(data.usage).slice(0, 240)}` : "";
    throw new Error(
      `OpenAI returned no output text (status: ${status}, reason: ${reason}). Try OPENAI_REPORT_REASONING_EFFORT="low" or a stronger model.${usage}`
    );
  }

  return outputText;
}

export function extractJSONFromText(text: string) {
  const stripped = text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("GPT returned no JSON object");
  }

  return JSON.parse(stripped.slice(start, end + 1)) as unknown;
}

export function extractHTMLFromText(text: string) {
  const stripped = text
    .replace(/^```(?:html)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();
  const lower = stripped.toLowerCase();
  const doctype = lower.indexOf("<!doctype html");
  if (doctype !== -1) return stripped.slice(doctype);

  const html = lower.indexOf("<html");
  if (html !== -1) return stripped.slice(html);

  throw new Error("GPT returned no valid HTML document");
}
