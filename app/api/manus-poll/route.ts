// app/api/manus-poll/route.ts
import { NextRequest, NextResponse } from "next/server";

const MANUS_BASE = "https://api.manus.ai/v2";

function extractReportJSON(text: string): object | null {
  const stripped = text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();

  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

function extractHTML(text: string): string | null {
  const stripped = text
    .replace(/^```(?:html)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();

  const start = stripped.toLowerCase().indexOf("<!doctype html");
  if (start !== -1) return stripped.slice(start);

  const htmlStart = stripped.toLowerCase().indexOf("<html");
  if (htmlStart !== -1) return stripped.slice(htmlStart);

  return null;
}

async function safeJSON(res: Response): Promise<any> {
  const text = await res.text();
  if (!text || text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    console.error("Non-JSON body:", text.slice(0, 300));
    return {};
  }
}

// NEW: fetch the HTML from a Manus file URL
async function fetchFileContent(fileUrl: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(fileUrl, {
      headers: { "x-manus-api-key": apiKey },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get("task_id");
  const mode   = req.nextUrl.searchParams.get("mode") ?? "json";

  if (!taskId) {
    return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
  }

  const manusApiKey = process.env.MANUS_API_KEY;
  if (!manusApiKey) {
    return NextResponse.json({ error: "MANUS_API_KEY is not configured" }, { status: 500 });
  }

  const headers = {
    "Content-Type": "application/json",
    "x-manus-api-key": manusApiKey,
  };

  try {
    const msgsRes = await fetch(
      `${MANUS_BASE}/task.listMessages?task_id=${taskId}&order=desc&limit=50`,
      { headers, cache: "no-store" }
    );
    const msgsData = await safeJSON(msgsRes);

    if (!msgsRes.ok) {
      return NextResponse.json(
        { error: msgsData?.error?.message ?? `Poll error (${msgsRes.status})` },
        { status: msgsRes.status }
      );
    }

    const messages: any[] = msgsData.messages ?? [];
    const latestStatus = messages.find((m) => m.type === "status_update");
    const agentStatus: string = latestStatus?.status_update?.agent_status ?? "running";
    const brief: string = latestStatus?.status_update?.brief ?? "Manus is working…";

    // ── STOPPED ──────────────────────────────────────────────────────────────
    if (agentStatus === "stopped") {
      const lastAssistant = messages.find((m) => m.type === "assistant_message");
      const rawContent: string = lastAssistant?.assistant_message?.content ?? "";

      if (mode === "html") {
        // First try: extract HTML directly from message content
        const inlineHTML = extractHTML(rawContent);
        if (inlineHTML) {
          return NextResponse.json({ status: "stopped", html: inlineHTML });
        }

        // Second try: look for file attachments in messages
        // Manus sometimes uploads the HTML as a file instead of inlining it
        const htmlFromFile = await extractHTMLFromFiles(messages, taskId, manusApiKey, headers);
        if (htmlFromFile) {
          return NextResponse.json({ status: "stopped", html: htmlFromFile });
        }

        // Third try: fetch task details which may include output files
        const taskFilesHTML = await fetchTaskOutputFiles(taskId, manusApiKey, headers);
        if (taskFilesHTML) {
          return NextResponse.json({ status: "stopped", html: taskFilesHTML });
        }

        console.error("Manus HTML task stopped but no HTML found. Sample:", rawContent.slice(0, 600));
        return NextResponse.json({
          status: "error",
          error: "Manus completed but returned no valid HTML. Raw: " + rawContent.slice(0, 120),
        });
      }

      // JSON mode (original behavior)
      const reportJSON = extractReportJSON(rawContent);
      if (!reportJSON) {
        console.error("Manus stopped but JSON not parseable. Raw sample:", rawContent.slice(0, 600));
        return NextResponse.json({
          status: "error",
          error:
            "Manus completed but returned an unparseable response. " +
            (rawContent.length > 0
              ? `Raw starts with: ${rawContent.slice(0, 120)}`
              : "Empty response."),
        });
      }

      return NextResponse.json({ status: "stopped", reportData: reportJSON, taskUrl: null });
    }

    // ── ERROR ─────────────────────────────────────────────────────────────────
    if (agentStatus === "error") {
      const errMsg =
        messages.find((m) => m.type === "error_message")?.error_message?.content ??
        "Task failed with an unknown error";
      return NextResponse.json({ status: "error", error: errMsg });
    }

    // ── WAITING — auto-confirm safe actions ───────────────────────────────────
    if (agentStatus === "waiting") {
      const waitDetail = latestStatus?.status_update?.status_detail ?? {};
      const eventType: string = waitDetail.waiting_for_event_type ?? "";
      const eventId: string   = waitDetail.waiting_for_event_id   ?? "";

      const autoConfirmTypes = [
        "mapreduceAction",
        "connectorOauthExpired",
        "deployAction",
        "terminalExecute",
        "apiHighCreditNotice",
      ];

      if (autoConfirmTypes.includes(eventType) && eventId) {
        await fetch(`${MANUS_BASE}/task.confirmAction`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            task_id: taskId,
            event_id: eventId,
            input:
              eventType === "apiHighCreditNotice"
                ? { action: "accept" }
                : { accept: true },
          }),
        });
        return NextResponse.json({ status: "running", brief: `Auto-confirmed: ${eventType}` });
      }

      return NextResponse.json({
        status: "waiting",
        brief: waitDetail.waiting_description ?? `Waiting: ${eventType}`,
      });
    }

    // ── RUNNING ───────────────────────────────────────────────────────────────
    return NextResponse.json({
      status: "running",
      brief: brief || "Manus is working on your report…",
    });
  } catch (err: any) {
    console.error("manus-poll unhandled error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

// Scan all messages for file attachments that look like HTML files
async function extractHTMLFromFiles(
  messages: any[],
  taskId: string,
  apiKey: string,
  headers: Record<string, string>
): Promise<string | null> {
  for (const msg of messages) {
    // Check tool_use messages (Manus file write actions)
    const content = msg?.tool_use?.input?.content ?? msg?.tool_result?.content ?? "";
    if (typeof content === "string") {
      const html = extractHTML(content);
      if (html) return html;
    }

    // Check for file references in assistant messages
    const attachments: any[] = msg?.assistant_message?.attachments ?? msg?.attachments ?? [];
    for (const att of attachments) {
      const url: string = att?.url ?? att?.file_url ?? att?.download_url ?? "";
      const name: string = (att?.name ?? att?.filename ?? "").toLowerCase();
      if (url && (name.endsWith(".html") || name.endsWith(".htm"))) {
        const fileContent = await fetchFileContent(url, apiKey);
        if (fileContent) {
          const html = extractHTML(fileContent);
          if (html) return html;
        }
      }
    }

    // Check for inline file content in tool results
    const toolResults: any[] = msg?.tool_results ?? [];
    for (const result of toolResults) {
      const resultContent = result?.content ?? "";
      if (typeof resultContent === "string") {
        const html = extractHTML(resultContent);
        if (html) return html;
      }
    }
  }
  return null;
}

// Fetch task output files via Manus task.listFiles or task.getDetails endpoint
async function fetchTaskOutputFiles(
  taskId: string,
  apiKey: string,
  headers: Record<string, string>
): Promise<string | null> {
  // Try task.listFiles endpoint
  try {
    const filesRes = await fetch(
      `https://api.manus.ai/v2/task.listFiles?task_id=${taskId}`,
      { headers, cache: "no-store" }
    );
    if (filesRes.ok) {
      const filesData = await filesRes.json();
      const files: any[] = filesData.files ?? filesData.data ?? [];
      
      // Look for HTML files, sorted by size descending (largest is most likely the report)
      const htmlFiles = files
        .filter((f: any) => {
          const name = (f?.name ?? f?.filename ?? f?.path ?? "").toLowerCase();
          return name.endsWith(".html") || name.endsWith(".htm");
        })
        .sort((a: any, b: any) => (b?.size ?? 0) - (a?.size ?? 0));

      for (const file of htmlFiles) {
        const url: string = file?.url ?? file?.download_url ?? file?.file_url ?? "";
        if (!url) continue;
        const content = await fetchFileContent(url, apiKey);
        if (content) {
          const html = extractHTML(content);
          if (html) return html;
        }
      }
    }
  } catch (err) {
    console.error("task.listFiles failed:", err);
  }

  // Try task.getDetails as fallback
  try {
    const detailRes = await fetch(
      `https://api.manus.ai/v2/task.getDetail?task_id=${taskId}`,
      { headers, cache: "no-store" }
    );
    if (detailRes.ok) {
      const detail = await detailRes.json();
      const outputFiles: any[] = detail?.output_files ?? detail?.files ?? detail?.outputs ?? [];
      
      for (const file of outputFiles) {
        const url: string = file?.url ?? file?.download_url ?? "";
        const name = (file?.name ?? file?.path ?? "").toLowerCase();
        if (!url || (!name.endsWith(".html") && !name.endsWith(".htm"))) continue;
        const content = await fetchFileContent(url, apiKey);
        if (content) {
          const html = extractHTML(content);
          if (html) return html;
        }
      }
    }
  } catch (err) {
    console.error("task.getDetail failed:", err);
  }

  return null;
}