"use client";
// components/dashboard/useManusReport.ts

import { useState, useRef, useCallback } from "react";
import type { ReportPayload } from "@/lib/buildReportPayload";

export type ManusReportStatus =
  | "idle"
  | "creating"
  | "running"
  | "waiting"
  | "done"        // JSON analysis done, now building HTML
  | "building"    // Second Manus task: generating HTML report
  | "error";

export interface ManusReportState {
  status: ManusReportStatus;
  brief: string;
  reportData: any | null;
  taskUrl: string | null;
  pdfUrl: string | null;
  pdfFilename: string | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 180;

async function safeFetch(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res  = await fetch(url, options);
    const text = await res.text();
    let data: any = {};
    if (text && text.trim() !== "") {
      try { data = JSON.parse(text); }
      catch { data = { error: `Non-JSON (${res.status}): ${text.slice(0, 200)}` }; }
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, data: { error: err?.message ?? "Network error" } };
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

  const pollTimerRef  = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef  = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const poll = useCallback(
    async (taskId: string) => {
      pollCountRef.current += 1;

      if (pollCountRef.current > MAX_POLLS) {
        stopPolling();
        setState((s) => ({ ...s, status: "error", error: "Report timed out after 15 minutes." }));
        return;
      }

      const { ok, data } = await safeFetch(
        `/api/manus-poll?task_id=${encodeURIComponent(taskId)}`
      );

      if (!ok) {
        stopPolling();
        setState((s) => ({
          ...s,
          status: "error",
          pdfUrl: null,
          pdfFilename: null,
          error: data?.error ?? "Polling failed",
        }));
        return;
      }

      const status: string = data?.status ?? "running";

      if (status === "stopped") {
        stopPolling();
        setState({
          status: "done",
          brief: "Deep analysis complete — now building HTML report with Manus…",
          reportData: data.reportData ?? null,
          taskUrl: data.taskUrl ?? null,
          pdfUrl: data.pdfUrl ?? null,
          pdfFilename: data.pdfFilename ?? null,
          error: null,
        });
        return;
      }

      if (status === "error") {
        stopPolling();
        setState((s) => ({ ...s, status: "error", error: data?.error ?? "Manus task failed" }));
        return;
      }

      setState((s) => ({
        ...s,
        status: status === "waiting" ? "waiting" : "running",
        brief: data?.brief ?? s.brief,
        taskUrl: data?.taskUrl ?? s.taskUrl,
        pdfUrl: data?.pdfUrl ?? s.pdfUrl,
        pdfFilename: data?.pdfFilename ?? s.pdfFilename,
      }));

      pollTimerRef.current = setTimeout(() => poll(taskId), POLL_INTERVAL_MS);
    },
    [stopPolling]
  );

  const generateReport = useCallback(
    async (payload: ReportPayload) => {
      stopPolling();
      pollCountRef.current = 0;

      setState({
        status: "creating",
        brief: "Submitting to Manus for deep analysis…",
        reportData: null,
        taskUrl: null,
        pdfUrl: null,
        pdfFilename: null,
        error: null,
      });

      const { ok, data } = await safeFetch("/api/manus-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });

      if (!ok || !data?.taskId) {
        setState((s) => ({
          ...s,
          status: "error",
          error: data?.error ?? "Failed to create Manus task",
        }));
        return;
      }

      setState((s) => ({
        ...s,
        status: "running",
        brief: "Manus AI is performing deep analysis of your ads data…",
        taskUrl: data.taskUrl ?? null,
      }));

      pollTimerRef.current = setTimeout(() => poll(data.taskId), POLL_INTERVAL_MS);
    },
    [poll, stopPolling]
  );

  // Call this to update brief during second stage (HTML building)
  const setBuilding = useCallback((brief: string) => {
    setState((s) => ({ ...s, status: "building", brief }));
  }, []);

  const dismiss = useCallback(() => {
    stopPolling();
    setState({
      status: "idle",
      brief: "",
      reportData: null,
      taskUrl: null,
      pdfUrl: null,
      pdfFilename: null,
      error: null,
    });
  }, [stopPolling]);

  return { state, generateReport, setBuilding, dismiss };
}