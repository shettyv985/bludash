// lib/generateReportPDF.ts
// Step 2 of the deep report flow:
// Takes the Manus JSON analysis + raw payload → creates a second Manus task
// that generates a full self-contained HTML report → polls until done →
// opens in new tab → user prints to PDF via browser (Ctrl+P).

import type { ReportPayload } from "./buildReportPayload";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS        = 180; // 15 min

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeFetch(url: string, options?: RequestInit) {
  const res  = await fetch(url, options);
  const text = await res.text();
  let data: any = {};
  if (text.trim()) {
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  }
  return { ok: res.ok, status: res.status, data };
}

export async function generateReportPDF(
  payload: ReportPayload,
  reportData: any,
  client: string,
  from: string,
  to: string,
  onProgress?: (brief: string) => void
): Promise<void> {

  // ── Step 1: Create the Manus HTML task ────────────────────────────────────
  onProgress?.("Sending analysis to Manus for HTML report generation…");

  const { ok: createOk, data: createData } = await safeFetch("/api/manus-html", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, reportData }),
  });

  if (!createOk || !createData?.taskId) {
    throw new Error(createData?.error ?? "Failed to create Manus HTML task");
  }

  const taskId: string = createData.taskId;

  // ── Step 2: Poll until done ───────────────────────────────────────────────
  let polls = 0;

  while (polls < MAX_POLLS) {
    await sleep(POLL_INTERVAL_MS);
    polls++;

    const { ok, data } = await safeFetch(
      `/api/manus-poll?task_id=${encodeURIComponent(taskId)}&mode=html`
    );

    if (!ok) {
      throw new Error(data?.error ?? "Polling failed for HTML task");
    }

    const status: string = data?.status ?? "running";
    const brief: string  = data?.brief  ?? "Manus is building your HTML report…";

    if (status === "stopped") {
      const html: string = data?.html ?? "";
      if (!html || !html.includes("<")) {
        throw new Error("Manus returned empty or invalid HTML");
      }

      // ── Step 3: Open in new tab → user prints ────────────────────────────
      onProgress?.("Report ready — opening in new tab…");
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, "_blank");

      if (!win) {
        // Popup blocked — download as .html instead
        const a = document.createElement("a");
        a.href = url;
        a.download = `bludash_report_${client}_${from}_${to}.html`;
        a.click();
      }

      // Clean up blob URL after a minute
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }

    if (status === "error") {
      throw new Error(data?.error ?? "Manus HTML task failed");
    }

    // still running/waiting — update progress
    onProgress?.(brief);
  }

  throw new Error("Manus HTML report timed out after 15 minutes");
}