
"use client";

import { useState, useRef, useCallback } from "react";

export type ManusReportStatus =
  | "idle"
  | "creating"
  | "running"
  | "waiting"
  | "done"
  | "error";

export interface ManusReportState {
  status: ManusReportStatus;
  brief: string;
  pdfUrl: string | null;
  pdfFilename: string | null;
  taskUrl: string | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 180; // 15 minutes max

export function useManusReport() {
  const [state, setState] = useState<ManusReportState>({
    status: "idle",
    brief: "",
    pdfUrl: null,
    pdfFilename: null,
    taskUrl: null,
    error: null,
  });

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);

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
        setState((s) => ({
          ...s,
          status: "error",
          error: "Report timed out after 15 minutes. Check Manus for results.",
        }));
        return;
      }

      try {
        const res = await fetch(`/api/manus-poll?task_id=${taskId}`);
        const data = await res.json();

        if (!res.ok) {
          stopPolling();
          setState((s) => ({
            ...s,
            status: "error",
            error: data.error ?? "Polling failed",
          }));
          return;
        }

        if (data.status === "stopped") {
          stopPolling();
          setState({
            status: "done",
            brief: "Report ready!",
            pdfUrl: data.pdfUrl ?? null,
            pdfFilename: data.pdfFilename ?? "report.pdf",
            taskUrl: data.taskUrl ?? null,
            error: null,
          });
          return;
        }

        if (data.status === "error") {
          stopPolling();
          setState((s) => ({
            ...s,
            status: "error",
            error: data.error ?? "Manus task failed",
          }));
          return;
        }

        // running or waiting — update brief and keep polling
        setState((s) => ({
          ...s,
          status: data.status === "waiting" ? "waiting" : "running",
          brief: data.brief ?? s.brief,
        }));

        pollTimerRef.current = setTimeout(() => poll(taskId), POLL_INTERVAL_MS);
      } catch (err: any) {
        stopPolling();
        setState((s) => ({
          ...s,
          status: "error",
          error: err.message ?? "Network error during polling",
        }));
      }
    },
    [stopPolling]
  );

  const generateReport = useCallback(
    async (params: {
      type: string;
      client: string;
      from: string;
      to: string;
    }) => {
      stopPolling();
      pollCountRef.current = 0;

      setState({
        status: "creating",
        brief: "Creating report task…",
        pdfUrl: null,
        pdfFilename: null,
        taskUrl: null,
        error: null,
      });

      try {
        const res = await fetch("/api/manus-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });

        const data = await res.json();

        if (!res.ok || !data.taskId) {
          setState((s) => ({
            ...s,
            status: "error",
            error: data.error ?? "Failed to create report task",
          }));
          return;
        }

        setState((s) => ({
          ...s,
          status: "running",
          brief: "Manus is fetching your ad data…",
          taskUrl: data.taskUrl ?? null,
        }));

        // Start polling
        pollTimerRef.current = setTimeout(
          () => poll(data.taskId),
          POLL_INTERVAL_MS
        );
      } catch (err: any) {
        setState((s) => ({
          ...s,
          status: "error",
          error: err.message ?? "Failed to start report",
        }));
      }
    },
    [poll, stopPolling]
  );

  const dismiss = useCallback(() => {
    stopPolling();
    setState({
      status: "idle",
      brief: "",
      pdfUrl: null,
      pdfFilename: null,
      taskUrl: null,
      error: null,
    });
  }, [stopPolling]);

  return { state, generateReport, dismiss };
}