// app/api/manus-poll/route.ts
import { NextRequest, NextResponse } from "next/server";

const MANUS_BASE = "https://api.manus.ai/v2";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("task_id");

    if (!taskId) {
      return NextResponse.json({ error: "task_id is required" }, { status: 400 });
    }

    const manusApiKey = process.env.MANUS_API_KEY;
    if (!manusApiKey) {
      return NextResponse.json(
        { error: "MANUS_API_KEY is missing" },
        { status: 500 }
      );
    }

    // Fetch the latest messages for this task (newest first, limit 50)
    const res = await fetch(
      `${MANUS_BASE}/task.listMessages?task_id=${taskId}&order=desc&limit=50`,
      {
        headers: { "x-manus-api-key": manusApiKey },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || data?.message || "Failed to poll task" },
        { status: res.status }
      );
    }

    const messages: any[] = data.messages ?? [];

    // Find the latest status_update to determine agent_status
    const latestStatusUpdate = messages.find((m) => m.type === "status_update");
    const agentStatus: string =
      latestStatusUpdate?.status_update?.agent_status ?? "running";

    const statusBrief: string =
      latestStatusUpdate?.status_update?.brief ?? "";

    // If stopped, scan all assistant_message events for PDF attachments
    if (agentStatus === "stopped") {
      let pdfUrl: string | null = null;
      let pdfFilename: string | null = null;
      let taskUrl: string | null = null;

      // Also grab the task URL from task.detail if needed
      // But first try to find a PDF in assistant_message attachments
      for (const msg of messages) {
        if (msg.type === "assistant_message") {
          const attachments: any[] = msg.assistant_message?.attachments ?? [];
          const pdfAttachment = attachments.find(
            (a) =>
              a.content_type === "application/pdf" ||
              (a.filename ?? "").toLowerCase().endsWith(".pdf")
          );
          if (pdfAttachment) {
            pdfUrl = pdfAttachment.url;
            pdfFilename = pdfAttachment.filename ?? "report.pdf";
            break;
          }
        }
      }

      // If no PDF in messages, fetch task.detail to get task_url as fallback
      if (!pdfUrl) {
        const detailRes = await fetch(`${MANUS_BASE}/task.detail?task_id=${taskId}`, {
          headers: { "x-manus-api-key": manusApiKey },
        });
        const detailData = await detailRes.json();
        taskUrl = detailData?.task?.task_url ?? null;
      }

      return NextResponse.json({
        status: "stopped",
        pdfUrl,
        pdfFilename,
        taskUrl,
        // Also return last assistant message text content as fallback
        lastMessage: messages.find((m) => m.type === "assistant_message")
          ?.assistant_message?.content ?? null,
      });
    }

    if (agentStatus === "error") {
      const errorContent =
        messages.find((m) => m.type === "error_message")?.error_message?.content ??
        "Task failed with an unknown error";
      return NextResponse.json({ status: "error", error: errorContent });
    }

    // For waiting status, auto-confirm common non-destructive actions
    if (agentStatus === "waiting") {
      const waitingDetail = latestStatusUpdate?.status_update?.status_detail ?? {};
      const eventType: string = waitingDetail.waiting_for_event_type ?? "";
      const eventId: string = waitingDetail.waiting_for_event_id ?? "";

      const autoConfirmTypes = [
        "mapreduceAction",
        "connectorOauthExpired",
        "deployAction",
        "terminalExecute",
        "apiHighCreditNotice",
      ];

      if (autoConfirmTypes.includes(eventType) && eventId) {
        // Auto-confirm
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

        return NextResponse.json({
          status: "running",
          brief: `Auto-confirmed: ${eventType}`,
        });
      }

      return NextResponse.json({
        status: "waiting",
        brief: waitingDetail.waiting_description ?? `Waiting: ${eventType}`,
        eventType,
        eventId,
      });
    }

    // Still running
    return NextResponse.json({
      status: "running",
      brief: statusBrief || "Manus is working on your report…",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Polling failed" },
      { status: 500 }
    );
  }
}