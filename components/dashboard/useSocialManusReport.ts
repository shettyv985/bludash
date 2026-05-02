"use client";
// components/dashboard/useSocialManusReport.ts

import { useState, useRef, useCallback } from "react";

export type SocialManusStatus =
  | "idle"
  | "creating"
  | "running"
  | "waiting"
  | "done"       // JSON analysis done, now building HTML
  | "building"   // Second Manus task: generating HTML report
  | "error";

export interface SocialManusState {
  status: SocialManusStatus;
  brief: string;
  reportData: any | null;
  taskUrl: string | null;   // ← NEW: Manus task URL for opening in browser
  pdfUrl: string | null;    // ← NEW: download URL if Manus returns one
  pdfFilename: string | null; // ← NEW
  error: string | null;
}

const SOCIAL_POLL_MS = 5000;
const SOCIAL_MAX_POLL = 180; // 15 minutes

async function socialSafeFetch(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let data: any = {};
    if (text && text.trim() !== "") {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: `Non-JSON (${res.status}): ${text.slice(0, 200)}` };
      }
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, data: { error: err?.message ?? "Network error" } };
  }
}

export function useSocialManusReport() {
  const [state, setState] = useState<SocialManusState>({
    status: "idle",
    brief: "",
    reportData: null,
    taskUrl: null,
    pdfUrl: null,
    pdfFilename: null,
    error: null,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollCount = useRef(0);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(
    async (taskId: string) => {
      pollCount.current += 1;

      if (pollCount.current > SOCIAL_MAX_POLL) {
        stopPolling();
        setState((s) => ({
          ...s,
          status: "error",
          error: "Report timed out after 15 minutes.",
        }));
        return;
      }

      const { ok, data } = await socialSafeFetch(
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
          brief: "Deep analysis complete — now building HTML report…",
          reportData: data.reportData ?? null,
          taskUrl: data.taskUrl ?? null,       // ← NEW
          pdfUrl: data.pdfUrl ?? null,         // ← NEW
          pdfFilename: data.pdfFilename ?? null, // ← NEW
          error: null,
        });
        return;
      }

      if (status === "error") {
        stopPolling();
        setState((s) => ({
          ...s,
          status: "error",
          error: data?.error ?? "Manus task failed",
        }));
        return;
      }

      // Still running / waiting — carry forward any taskUrl/pdfUrl already received
      setState((s) => ({
        ...s,
        status: status === "waiting" ? "waiting" : "running",
        brief: data?.brief ?? s.brief,
        taskUrl: data?.taskUrl ?? s.taskUrl,       // ← NEW
        pdfUrl: data?.pdfUrl ?? s.pdfUrl,         // ← NEW
        pdfFilename: data?.pdfFilename ?? s.pdfFilename, // ← NEW
      }));

      timerRef.current = setTimeout(() => poll(taskId), SOCIAL_POLL_MS);
    },
    [stopPolling]
  );

  const generateReport = useCallback(
    async (payload: any) => {
      stopPolling();
      pollCount.current = 0;

      setState({
        status: "creating",
        brief: "Submitting to Manus for deep social analysis…",
        reportData: null,
        taskUrl: null,
        pdfUrl: null,
        pdfFilename: null,
        error: null,
      });

      const { ok, data } = await socialSafeFetch("/api/social-manus-report", {
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
        brief: "Manus AI is performing deep analysis of your social data…",
        taskUrl: data.taskUrl ?? null, // ← NEW: capture if API returns it immediately
      }));

      timerRef.current = setTimeout(() => poll(data.taskId), SOCIAL_POLL_MS);
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