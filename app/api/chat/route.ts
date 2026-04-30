import { NextRequest, NextResponse } from "next/server";

const MANUS_BASE = "https://api.manus.ai/v2";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]+/g, "_");
}

function extractTextFromContent(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text") return part.text || "";
        if (part?.text) return part.text;
        return "";
      })
      .join("\n")
      .trim();
  }
  if (content?.text) return content.text;
  return "";
}

function extractAssistantText(events: any[]): string {
  const assistantEvents = events.filter((e) => e?.type === "assistant_message");
  for (let i = assistantEvents.length - 1; i >= 0; i--) {
    const event = assistantEvents[i];
    const text =
      extractTextFromContent(event?.assistant_message?.content) ||
      extractTextFromContent(event?.content) ||
      extractTextFromContent(event?.message?.content);
    if (text.trim()) return text.trim();
  }
  return "";
}

function getLatestStatus(events: any[]): string {
  const statusEvents = events.filter((e) => e?.type === "status_update");
  const latest = statusEvents[statusEvents.length - 1];
  return latest?.status_update?.agent_status || "";
}

function getInstantReply(userText: string): string | null {
  const text = userText.trim().toLowerCase();
  if (!text) return "Ask me anything about this report.";
  if (/^(hi|hello|hey|yo)\b/.test(text) || /\bhow are you\b/.test(text))
    return "I'm Bludash AI Analyst. Ask me about this report and I'll break it down for you.";
  if (
    /\bwhich model are you\b/.test(text) ||
    /\bwhat model are you\b/.test(text) ||
    /\bwho are you\b/.test(text) ||
    /\bwhat are you\b/.test(text) ||
    /\bare you ai\b/.test(text)
  )
    return "I'm Bludash AI Analyst, powered by Manus AI behind the scenes.";
  if (/\bthank(s| you)?\b/.test(text))
    return "Anytime. Ask the next one whenever you're ready.";
  return null;
}

async function uploadTextFile(
  apiKey: string,
  filename: string,
  content: string,
  contentType = "text/markdown; charset=utf-8"
) {
  const createFileRes = await fetch(`${MANUS_BASE}/file.upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-manus-api-key": apiKey,
    },
    body: JSON.stringify({ filename }),
  });

  const createFileData = await createFileRes.json();

  if (!createFileRes.ok) {
    throw new Error(
      createFileData?.error?.message ||
        createFileData?.message ||
        "Failed to create Manus file"
    );
  }

  const uploadUrl = createFileData?.upload_url;
  const fileId = createFileData?.file?.id;

  if (!uploadUrl || !fileId) {
    throw new Error("Manus file upload URL or file ID was missing");
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: content,
  });

  if (!uploadRes.ok) {
    throw new Error("Failed to upload report context file to Manus");
  }

  return { fileId };
}

function buildSocialReportAttachment(
  reportData: any,
  client: string,
  from: string,
  to: string
) {
  const fbPosts = Array.isArray(reportData?.fbPosts) ? reportData.fbPosts : [];
  const igPosts = Array.isArray(reportData?.igPosts) ? reportData.igPosts : [];
  const fbSummary = reportData?.summary?.facebook || {};
  const igSummary = reportData?.summary?.instagram || {};

  const lines: string[] = [];

  lines.push(`# Bludash Social Media Performance Report`);
  lines.push(`Client: ${client}`);
  lines.push(`Date Range: ${from} to ${to}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(``);

  lines.push(`## Facebook Summary`);
  lines.push(`- Organic Likes: ${fbSummary.organicLikes ?? 0}`);
  lines.push(`- Organic Comments: ${fbSummary.organicComments ?? 0}`);
  lines.push(`- Organic Shares: ${fbSummary.organicShares ?? 0}`);
  lines.push(`- Organic Reach: ${fbSummary.organicReach ?? 0}`);
  lines.push(`- Paid Reach: ${fbSummary.paidReach ?? 0}`);
  lines.push(`- Total Posts: ${fbSummary.totalPosts ?? 0}`);
  lines.push(`- Follows: ${fbSummary.follows ?? 0}`);
  lines.push(`- Unfollows: ${fbSummary.unfollows ?? 0}`);
  lines.push(`- Net Followers: ${fbSummary.netFollowers ?? 0}`);
  lines.push(`- Page Views: ${fbSummary.pageViews ?? 0}`);
  lines.push(``);

  lines.push(`## Instagram Summary`);
  lines.push(`- Organic Likes: ${igSummary.organicLikes ?? 0}`);
  lines.push(`- Organic Comments: ${igSummary.organicComments ?? 0}`);
  lines.push(`- Organic Shares: ${igSummary.organicShares ?? 0}`);
  lines.push(`- Organic Saves: ${igSummary.organicSaves ?? 0}`);
  lines.push(`- Organic Reach: ${igSummary.organicReach ?? 0}`);
  lines.push(`- Paid Likes: ${igSummary.paidLikes ?? 0}`);
  lines.push(`- Paid Comments: ${igSummary.paidComments ?? 0}`);
  lines.push(`- Paid Shares: ${igSummary.paidShares ?? 0}`);
  lines.push(`- Paid Reach: ${igSummary.paidReach ?? 0}`);
  lines.push(`- Total Posts: ${igSummary.totalPosts ?? 0}`);
  lines.push(`- Follows: ${igSummary.follows ?? 0}`);
  lines.push(`- Unfollows: ${igSummary.unfollows ?? 0}`);
  lines.push(`- Net Followers: ${igSummary.netFollowers ?? 0}`);
  lines.push(`- Profile Views: ${igSummary.profileViews ?? 0}`);
  lines.push(``);

  lines.push(`## Facebook Posts (${fbPosts.length} total)`);
  if (fbPosts.length === 0) {
    lines.push(`No Facebook posts in this period.`);
  } else {
    fbPosts.forEach((post: any, index: number) => {
      lines.push(
        `${index + 1}. [${safeText(post.type)}] ${safeText(post.createdTime)} | Reach: ${post.reach ?? 0} | Likes: ${post.likes ?? 0} | Comments: ${post.comments ?? 0} | Shares: ${post.shares ?? 0} | ER: ${safeText(post.engagementRate)}% | Caption: "${safeText(post.message) || "No caption"}"`
      );
      if (post?.boosted) {
        lines.push(
          `   → BOOSTED: Spend ₹${post.boosted.amountSpent ?? "0"} | Paid Reach: ${post.boosted.paidReach ?? 0} | Impressions: ${post.boosted.impressions ?? 0} | Clicks: ${post.boosted.clicks ?? 0} | CPM: ₹${post.boosted.cpm ?? "0"} | CTR: ${post.boosted.ctr ?? "0"}%`
        );
      }
    });
  }

  lines.push(``);
  lines.push(`## Instagram Posts (${igPosts.length} total)`);
  if (igPosts.length === 0) {
    lines.push(`No Instagram posts in this period.`);
  } else {
    igPosts.forEach((post: any, index: number) => {
      lines.push(
        `${index + 1}. [${safeText(post.type)}] ${safeText(post.createdTime)} | Reach: ${post.reach ?? 0} | Likes: ${post.likes ?? 0} | Comments: ${post.comments ?? 0} | Shares: ${post.shares ?? 0} | Saves: ${post.saves ?? 0} | ER: ${safeText(post.engagementRate)}% | Avg Watch Time: ${post.avgWatchTime ?? 0}s | Caption: "${safeText(post.message) || "No caption"}"`
      );
      if (post?.boosted) {
        lines.push(
          `   → BOOSTED: Spend ₹${post.boosted.amountSpent ?? "0"} | Paid Reach: ${post.boosted.paidReach ?? 0} | Paid Likes: ${post.boosted.paidLikes ?? 0} | Paid Comments: ${post.boosted.paidComments ?? 0} | Impressions: ${post.boosted.impressions ?? 0} | Clicks: ${post.boosted.clicks ?? 0} | CPM: ₹${post.boosted.cpm ?? "0"} | CTR: ${post.boosted.ctr ?? "0"}%`
        );
      }
    });
  }

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const { messages, reportData, client, from, to } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    const latestUserMessage =
      [...messages]
        .reverse()
        .find((msg: ChatMessage) => msg.role === "user")
        ?.content?.trim() || "";

    // ── Instant replies for greetings / meta questions ─────────────────────
    const instantReply = getInstantReply(latestUserMessage);
    if (instantReply) {
      return NextResponse.json({ ok: true, content: instantReply });
    }

    const manusApiKey = process.env.MANUS_API_KEY;
    if (!manusApiKey) {
      return NextResponse.json(
        { error: "MANUS_API_KEY is missing in environment variables" },
        { status: 500 }
      );
    }

    // ── Parse connector IDs (optional — only needed for external tool access) ─
    const connectorIds =
      process.env.MANUS_CONNECTOR_IDS?.split(",")
        .map((id) => id.trim())
        .filter(Boolean) || [];

    // ── Build and upload the context file ─────────────────────────────────
    const attachmentContent = buildSocialReportAttachment(
      reportData,
      client,
      from,
      to
    );
    const filename = `bludash_chat_context_${safeFilename(client)}_${from}_${to}.md`;

    let fileId: string;
    try {
      ({ fileId } = await uploadTextFile(manusApiKey, filename, attachmentContent));
    } catch (uploadErr: any) {
      console.error("File upload failed:", uploadErr);
      return NextResponse.json(
        { error: `Failed to upload context: ${uploadErr.message}` },
        { status: 500 }
      );
    }

    // ── Build the prompt ───────────────────────────────────────────────────
    const prompt = [
      `You are Bludash AI Analyst inside a social media reporting dashboard.`,
      ``,
      `Client: ${client}`,
      `Date range: ${from} to ${to}`,
      ``,
      `The attached markdown file contains ALL the performance data for this period.`,
      `Use ONLY the numbers from that file to answer. Do not browse the web.`,
      ``,
      `User question:`,
      latestUserMessage,
      ``,
      `Instructions:`,
      `- Answer directly and concisely.`,
      `- Always cite exact numbers from the data file.`,
      `- If comparing posts, name them by caption snippet or post number.`,
      `- Keep the response under 300 words unless the question requires more.`,
      `- Do not restate all the data — only what is relevant to the question.`,
    ].join("\n");

    // ── Create Manus task ──────────────────────────────────────────────────
    const createRes = await fetch(`${MANUS_BASE}/task.create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": manusApiKey,
      },
      body: JSON.stringify({
        message: {
          content: [
            { type: "text", text: prompt },
            { type: "file", file_id: fileId },
          ],
        },
        // connectors at TOP LEVEL — this is the fix
        ...(connectorIds.length > 0 && { connectors: connectorIds }),
        title: `Bludash Chat — ${client} — ${from} to ${to}`,
        hide_in_task_list: true,
        share_visibility: "private",
        interactive_mode: false,
        agent_profile: "manus-1.6",
      }),
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      console.error("Manus task.create failed:", createData);
      return NextResponse.json(
        {
          error:
            createData?.error?.message ||
            createData?.message ||
            "Failed to create Manus task",
        },
        { status: createRes.status }
      );
    }

    const taskId: string = createData.task_id;
    const taskUrl: string = createData.task_url ?? null;

    if (!taskId) {
      return NextResponse.json(
        { error: "Manus did not return a task ID" },
        { status: 500 }
      );
    }

    // ── Poll for completion ────────────────────────────────────────────────
    // 40 attempts × 3s = up to 2 minutes
    let finalText = "";
    let finalStatus = "";

    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(3000);

      let eventsData: any = {};
      try {
        const eventsRes = await fetch(
          `${MANUS_BASE}/task.listMessages?task_id=${encodeURIComponent(taskId)}&order=asc&limit=100`,
          { headers: { "x-manus-api-key": manusApiKey } }
        );
        eventsData = await eventsRes.json();
      } catch (pollErr) {
        console.error(`Poll attempt ${attempt + 1} fetch error:`, pollErr);
        continue;
      }

      const events: any[] = eventsData?.data || eventsData?.messages || [];
      finalText = extractAssistantText(events);
      finalStatus = getLatestStatus(events);

      // ── Auto-confirm waiting actions ───────────────────────────────────
      if (finalStatus === "waiting") {
        const statusEvent = events
          .filter((e) => e?.type === "status_update")
          .slice(-1)[0];
        const waitDetail =
          statusEvent?.status_update?.status_detail ?? {};
        const eventType: string =
          waitDetail.waiting_for_event_type ?? "";
        const eventId: string =
          waitDetail.waiting_for_event_id ?? "";

        const autoConfirmTypes = [
          "mapreduceAction",
          "connectorOauthExpired",
          "deployAction",
          "terminalExecute",
          "apiHighCreditNotice",
        ];

        if (autoConfirmTypes.includes(eventType) && eventId) {
          try {
            await fetch(`${MANUS_BASE}/task.confirmAction`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-manus-api-key": manusApiKey,
              },
              body: JSON.stringify({
                task_id: taskId,
                event_id: eventId,
                input:
                  eventType === "apiHighCreditNotice"
                    ? { action: "accept" }
                    : { accept: true },
              }),
            });
          } catch (confirmErr) {
            console.error("Auto-confirm failed:", confirmErr);
          }
        }
        // keep polling
        continue;
      }

      if (finalStatus === "stopped" && finalText) break;

      if (finalStatus === "error") {
        return NextResponse.json({
          ok: false,
          content:
            "Manus encountered an error while generating the response.",
          taskUrl,
        });
      }
    }

    // ── Return result ──────────────────────────────────────────────────────
    if (!finalText) {
      finalText =
        "Manus is still working on this. Open the full task for the complete answer.";
    }

    return NextResponse.json({
      ok: true,
      content: finalText,
      taskUrl,
      taskId,
      status: finalStatus || "running",
    });
  } catch (error: any) {
    console.error("Manus chat API error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong" },
      { status: 500 }
    );
  }
}