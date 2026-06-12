"use client";
// components/dashboard/useManusReport.ts

import { useCallback, useState } from "react";
import type { ReportPayload } from "@/lib/buildReportPayload";

export type ManusReportStatus =
  | "idle"
  | "creating"
  | "running"
  | "waiting"
  | "done"
  | "building"
  | "error";

export interface ManusReportState {
  status: ManusReportStatus;
  brief: string;
  reportData: unknown | null;
  taskUrl: string | null;
  pdfUrl: string | null;
  pdfFilename: string | null;
  error: string | null;
}

async function safeFetch(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (text && text.trim() !== "") {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        data = { error: `Non-JSON (${res.status}): ${text.slice(0, 200)}` };
      }
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 0,
      data: { error: err instanceof Error ? err.message : "Network error" },
    };
  }
}

export function useManusReport() {
  const [state, setState] = useState<ManusReportState>({
    status: "idle",
    brief: "",
    reportData: null,
    taskUrl: null,
    pdfUrl: null,
    pdfFilename: null,
    error: null,
  });

  const generateReport = useCallback(async (payload: ReportPayload) => {
    setState({
      status: "creating",
      brief: "Submitting to GPT-5.5 for deep analysis...",
      reportData: null,
      taskUrl: null,
      pdfUrl: null,
      pdfFilename: null,
      error: null,
    });

    setState((s) => ({
      ...s,
      status: "running",
      brief: "GPT-5.5 is analyzing your ads data...",
    }));

    const { ok, data } = await safeFetch("/api/gpt-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });

    if (!ok || !data?.reportData) {
      setState((s) => ({
        ...s,
        status: "error",
        error: String(data?.error || "Failed to generate GPT report"),
      }));
      return;
    }

    setState({
      status: "done",
      brief: "Deep analysis complete - now building HTML report...",
      reportData: data.reportData,
      taskUrl: null,
      pdfUrl: null,
      pdfFilename: null,
      error: null,
    });
  }, []);

  const setBuilding = useCallback((brief: string) => {
    setState((s) => ({ ...s, status: "building", brief }));
  }, []);

  const dismiss = useCallback(() => {
    setState({
      status: "idle",
      brief: "",
      reportData: null,
      taskUrl: null,
      pdfUrl: null,
      pdfFilename: null,
      error: null,
    });
  }, []);

  return { state, generateReport, setBuilding, dismiss };
}
