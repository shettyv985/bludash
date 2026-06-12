// lib/generateSocialReportPDF.ts
// Step 2 of the social deep report flow:
// Takes the GPT JSON analysis + raw social payload → asks GPT for a full HTML report →
// opens in new tab → user prints to PDF via browser (Ctrl+P).

import type { SocialReportPayload } from "./buildSocialReportPayload";

type SafeFetchData = {
  html?: string;
  error?: string;
};

async function safeFetch(url: string, options?: RequestInit) {
  const res  = await fetch(url, options);
  const text = await res.text();
  let data: SafeFetchData = {};
  if (text.trim()) {
    try { data = JSON.parse(text) as SafeFetchData; } catch { data = { error: text.slice(0, 200) }; }
  }
  return { ok: res.ok, status: res.status, data };
}

export async function generateSocialReportPDF(
  payload: SocialReportPayload,
  reportData: unknown,
  client: string,
  from: string,
  to: string,
  onProgress?: (brief: string) => void
): Promise<void> {

  onProgress?.("Rendering social HTML report locally...");

  const { ok, data } = await safeFetch("/api/gpt-html-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "social", payload, reportData }),
  });

  const html = typeof data?.html === "string" ? data.html : "";
  if (!ok || !html || !html.includes("<")) {
    throw new Error(data?.error || "Failed to generate GPT social HTML report");
  }

  onProgress?.("Report ready - opening in new tab...");
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");

  if (!win) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `bludash_social_report_${client}_${from}_${to}.html`;
    a.click();
  }

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
