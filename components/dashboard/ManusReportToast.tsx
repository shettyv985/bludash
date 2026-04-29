// components/ManusReportToast.tsx
"use client";

import { ManusReportState } from "./useManusReport";

interface Props {
  state: ManusReportState;
  onDismiss: () => void;
  dark: boolean;
}

export default function ManusReportToast({ state, onDismiss, dark }: Props) {
  const { status, brief, pdfUrl, pdfFilename, taskUrl, error } = state;

  if (status === "idle") return null;

  const isActive = status === "creating" || status === "running" || status === "waiting";
  const isDone = status === "done";
  const isError = status === "error";

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-2xl border max-w-sm w-full transition-all duration-300 ${
        isDone
          ? dark
            ? "bg-emerald-950 border-emerald-500/40"
            : "bg-emerald-50 border-emerald-300"
          : isError
            ? dark
              ? "bg-red-950 border-red-500/40"
              : "bg-red-50 border-red-300"
            : dark
              ? "bg-[#1a1a2e] border-white/10"
              : "bg-white border-slate-200"
      }`}
    >
      {/* Icon / Spinner */}
      <div className="flex-shrink-0 mt-0.5">
        {isActive && (
          <svg
            className={`animate-spin w-4 h-4 ${dark ? "text-fuchsia-400" : "text-fuchsia-600"}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}
        {isDone && (
          <svg
            className={`w-4 h-4 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {isError && (
          <svg
            className={`w-4 h-4 ${dark ? "text-red-400" : "text-red-600"}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-[12px] font-bold leading-tight ${
            isDone
              ? dark ? "text-emerald-300" : "text-emerald-800"
              : isError
                ? dark ? "text-red-300" : "text-red-800"
                : dark ? "text-white/80" : "text-slate-800"
          }`}
        >
          {isDone
            ? "Report Ready!"
            : isError
              ? "Report Failed"
              : "Generating Report…"}
        </p>

        {isActive && brief && (
          <p className={`text-[11px] mt-0.5 truncate ${dark ? "text-white/35" : "text-slate-500"}`}>
            {brief}
          </p>
        )}

        {isError && error && (
          <p className={`text-[11px] mt-0.5 leading-snug ${dark ? "text-red-400/70" : "text-red-700"}`}>
            {error}
          </p>
        )}

        {isDone && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {pdfUrl ? (
              <a
                href={pdfUrl}
                download={pdfFilename ?? "report.pdf"}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  dark
                    ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF
              </a>
            ) : taskUrl ? (
              <a
                href={taskUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  dark
                    ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                View Report
              </a>
            ) : (
              <p className={`text-[11px] ${dark ? "text-emerald-400/60" : "text-emerald-700"}`}>
                Report complete — no PDF attachment found.
              </p>
            )}
          </div>
        )}

        {/* Progress dots for active state */}
        {isActive && (
          <div className="flex gap-1 mt-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-1 h-1 rounded-full animate-pulse ${
                  dark ? "bg-fuchsia-400/50" : "bg-fuchsia-500/50"
                }`}
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full transition-colors mt-0.5 ${
          dark ? "text-white/20 hover:text-white/50 hover:bg-white/10" : "text-black/20 hover:text-black/50 hover:bg-black/5"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}