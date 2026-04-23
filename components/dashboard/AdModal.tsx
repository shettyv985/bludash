"use client";

// C:\Users\Varun Shetty\Desktop\New folder\bludash\components\dashboard\AdModal.tsx

import { useEffect, useState } from "react";

const BASE = "https://graph.facebook.com/v25.0";

interface AdInsight {
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  cpm: number;
  ctr: number;
  cpc: number;
  likes: number;
  comments: number;
  shares: number;
  videoViews: number;
  currency: string;
}

interface Ad {
  id: string;
  name: string;
  status: string;
  adSetId: string;
  adSetName: string;
  campaignId: string;
  campaignName: string;
  campaignObjective: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  thumbnail: string | null;
  videoId: string | null;
  isVideo: boolean;
  insights: AdInsight;
}

interface Props {
  ad: Ad | null;
  onClose: () => void;
  dark: boolean;
  token: string;
}

function StatBox({ label, value, sub, accent, dark }: {
  label: string; value: string | number; sub?: string; accent?: string; dark: boolean;
}) {
  return (
    <div className={`rounded-xl px-4 py-3 flex flex-col gap-0.5 border ${
      dark ? "bg-white/[0.03] border-white/[0.05]" : "bg-white border-black/10 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
    }`}>
      <p className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? "text-white/25" : "text-slate-400"}`}>{label}</p>
      <p className={`text-lg font-bold ${accent || (dark ? "text-white" : "text-slate-900")}`}>{value}</p>
      {sub && <p className={`text-[10px] ${dark ? "text-white/20" : "text-slate-400"}`}>{sub}</p>}
    </div>
  );
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: decimals });
}
function fmtMoney(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
function fmtPct(n: number) { return n.toFixed(2) + "%"; }

function getCTRAccent(ctr: number, dark: boolean) {
  return ctr >= 1.5 ? (dark ? "text-emerald-400" : "text-emerald-600")
    : ctr >= 0.8 ? (dark ? "text-yellow-400" : "text-yellow-600")
    : (dark ? "text-red-400" : "text-red-600");
}
function getCPCAccent(cpc: number, dark: boolean) {
  return cpc < 5 ? (dark ? "text-emerald-400" : "text-emerald-600")
    : cpc < 15 ? (dark ? "text-yellow-400" : "text-yellow-600")
    : (dark ? "text-red-400" : "text-red-600");
}

export default function AdModal({ ad, onClose, dark, token }: Props) {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    setVideoSrc(null);
    setVideoError(false);
    setMediaLoading(false);
  }, [ad?.id]);

  // Fetch video source from Meta if this is a video ad
  useEffect(() => {
    if (!ad?.isVideo || !ad.videoId || !token) return;
    setMediaLoading(true);
    fetch(`${BASE}/${ad.videoId}?fields=source,picture&access_token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.source) setVideoSrc(`/api/proxy-video?url=${encodeURIComponent(d.source)}`);
        else setVideoSrc(null);
      })
      .catch(() => setVideoSrc(null))
      .finally(() => setMediaLoading(false));
  }, [ad?.id, ad?.videoId, token]);

  if (!ad) return null;

  const ins = ad.insights;
  const hasEngagement = ins.likes > 0 || ins.comments > 0 || ins.shares > 0 || ins.videoViews > 0;

  const statusColor =
    ad.status === "ACTIVE"   ? dark ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-100 text-emerald-700" :
    ad.status === "PAUSED"   ? dark ? "bg-yellow-500/15 text-yellow-400"   : "bg-yellow-100 text-yellow-700"   :
    ad.status === "ARCHIVED" ? dark ? "bg-slate-500/15 text-slate-400"     : "bg-slate-100 text-slate-500"     :
                               dark ? "bg-white/[0.06] text-white/30"      : "bg-slate-100 text-slate-500";

  const renderMedia = () => {
    // Video with source
    if (ad.isVideo && videoSrc && !videoError) {
      return (
        <div className="w-full bg-black rounded-t-2xl overflow-hidden flex items-center justify-center" style={{ minHeight: 320 }}>
          <video
            key={ad.id}
            src={videoSrc}
            controls
            playsInline
            preload="metadata"
            poster={ad.thumbnail ?? undefined}
            onError={() => setVideoError(true)}
            style={{ width: "100%", maxHeight: 480, objectFit: "contain", background: "#000", display: "block" }}
          />
        </div>
      );
    }

    // Video loading
    if (ad.isVideo && mediaLoading) {
      return (
        <div className="w-full bg-black rounded-t-2xl overflow-hidden relative flex items-center justify-center" style={{ minHeight: 220 }}>
          {ad.thumbnail && <img src={ad.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />}
          <div className="flex flex-col items-center gap-3 z-10">
            <svg className="animate-spin h-8 w-8 text-white/50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="text-white/40 text-[12px]">Loading video...</span>
          </div>
        </div>
      );
    }

    // Video with no source / error — thumbnail + overlay
    if (ad.isVideo) {
      return (
        <div className="w-full bg-black rounded-t-2xl overflow-hidden relative flex items-center justify-center" style={{ minHeight: 220 }}>
          {ad.thumbnail && <img src={ad.thumbnail} alt="" className="w-full object-cover opacity-40" style={{ maxHeight: 320 }} />}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${dark ? "bg-white/10" : "bg-black/20"}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            </div>
            <span className="text-white/60 text-[11px] bg-black/50 px-3 py-1 rounded-full">Video preview unavailable</span>
          </div>
        </div>
      );
    }

    // Static image
    if (ad.thumbnail) {
      return (
        <div className={`w-full rounded-t-2xl overflow-hidden flex items-center justify-center ${dark ? "bg-black/60" : "bg-black/10"}`}>
          <img src={ad.thumbnail} alt="" className="w-full object-contain" style={{ maxHeight: 360 }} />
        </div>
      );
    }

    // No media
    return (
      <div className={`w-full rounded-t-2xl flex flex-col items-center justify-center gap-2 py-12 ${dark ? "bg-black/40" : "bg-slate-100"}`}>
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className={dark ? "text-white/15" : "text-slate-300"}>
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
        <p className={`text-[11px] ${dark ? "text-white/20" : "text-slate-400"}`}>No creative preview</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4" onClick={onClose}>
      <div className={`fixed inset-0 ${dark ? "bg-black/80" : "bg-black/40"} backdrop-blur-sm`} />

      <div
        className={`relative w-full max-w-[640px] rounded-2xl shadow-2xl flex flex-col my-auto ${
          dark ? "bg-[#0e0e1a] border border-white/[0.07]" : "bg-white border border-black/[0.08]"
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-blue-500/60 to-transparent rounded-full" />

        <button onClick={onClose} className={`absolute top-4 right-4 p-1.5 rounded-lg transition-all z-10 ${
          dark ? "text-white/30 hover:text-white/80 hover:bg-white/[0.06]" : "text-black/30 hover:text-black/70 hover:bg-black/[0.05]"
        }`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {renderMedia()}

        <div className="flex flex-col gap-5 p-6">

          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              {ad.isVideo ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[15px] font-semibold leading-snug pr-8 ${dark ? "text-white" : "text-slate-900"}`}>{ad.name}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full tracking-widest uppercase ${statusColor}`}>{ad.status}</span>
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                  ad.isVideo ? (dark ? "bg-purple-500/15 text-purple-400" : "bg-purple-100 text-purple-700")
                             : (dark ? "bg-white/[0.06] text-white/35"   : "bg-slate-100 text-slate-600")
                }`}>
                  {ad.isVideo ? "VIDEO" : "IMAGE"}
                </span>
                {ad.campaignObjective && (
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${dark ? "bg-blue-500/15 text-blue-400" : "bg-blue-100 text-blue-700"}`}>
                    {ad.campaignObjective}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Campaign hierarchy */}
          <div className={`rounded-xl px-4 py-3 border flex flex-col gap-2 ${dark ? "bg-white/[0.02] border-white/[0.05]" : "bg-slate-50 border-black/[0.07]"}`}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
              <p className={`text-[10px] font-semibold tracking-widest uppercase w-16 flex-shrink-0 ${dark ? "text-white/25" : "text-slate-400"}`}>Campaign</p>
              <p className={`text-[12px] font-medium truncate ${dark ? "text-white/70" : "text-slate-700"}`}>{ad.campaignName}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
              <p className={`text-[10px] font-semibold tracking-widest uppercase w-16 flex-shrink-0 ${dark ? "text-white/25" : "text-slate-400"}`}>Ad Set</p>
              <p className={`text-[12px] font-medium truncate ${dark ? "text-white/70" : "text-slate-700"}`}>{ad.adSetName}</p>
            </div>
            {(ad.dailyBudget || ad.lifetimeBudget) && (
              <div className={`flex items-center gap-4 pt-1.5 border-t ${dark ? "border-white/[0.05]" : "border-black/[0.06]"}`}>
                {ad.dailyBudget    && <div className="flex items-center gap-1.5"><p className={`text-[10px] ${dark ? "text-white/25" : "text-slate-400"}`}>Daily</p><p className={`text-[12px] font-semibold ${dark ? "text-amber-400" : "text-amber-600"}`}>{fmtMoney(ad.dailyBudget)}</p></div>}
                {ad.lifetimeBudget && <div className="flex items-center gap-1.5"><p className={`text-[10px] ${dark ? "text-white/25" : "text-slate-400"}`}>Lifetime</p><p className={`text-[12px] font-semibold ${dark ? "text-amber-400" : "text-amber-600"}`}>{fmtMoney(ad.lifetimeBudget)}</p></div>}
              </div>
            )}
          </div>

          {/* Delivery */}
          <div className="flex flex-col gap-2">
            <p className={`text-[10px] font-bold tracking-widest uppercase ${dark ? "text-white/25" : "text-slate-400"}`}>Delivery</p>
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Spend"       value={fmtMoney(ins.spend)}  dark={dark} accent={dark ? "text-amber-400" : "text-amber-600"} />
              <StatBox label="Reach"       value={fmt(ins.reach)}       dark={dark} />
              <StatBox label="Impressions" value={fmt(ins.impressions)} dark={dark} />
            </div>
          </div>

          {/* Performance */}
          <div className="flex flex-col gap-2">
            <p className={`text-[10px] font-bold tracking-widest uppercase ${dark ? "text-white/25" : "text-slate-400"}`}>Performance</p>
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Clicks" value={fmt(ins.clicks)} dark={dark} />
              <StatBox label="CTR" value={fmtPct(ins.ctr)} dark={dark} accent={getCTRAccent(ins.ctr, dark)} sub={ins.ctr >= 1.5 ? "Good" : ins.ctr >= 0.8 ? "Average" : "Below avg"} />
              <StatBox label="CPC" value={ins.cpc > 0 ? fmtMoney(ins.cpc) : "—"} dark={dark} accent={ins.cpc > 0 ? getCPCAccent(ins.cpc, dark) : undefined} />
              <StatBox label="CPM" value={fmtMoney(ins.cpm)} dark={dark} sub="Per 1,000 impressions" />
            </div>
          </div>

          {/* Engagement */}
          {hasEngagement && (
            <div className="flex flex-col gap-2">
              <p className={`text-[10px] font-bold tracking-widest uppercase ${dark ? "text-blue-400/70" : "text-blue-600"}`}>Engagement</p>
              <div className="grid grid-cols-3 gap-2">
                {ins.likes      > 0 && <StatBox label="Likes"       value={fmt(ins.likes)}      dark={dark} accent={dark ? "text-blue-400" : "text-blue-600"} />}
                {ins.comments   > 0 && <StatBox label="Comments"    value={fmt(ins.comments)}   dark={dark} accent={dark ? "text-blue-400" : "text-blue-600"} />}
                {ins.shares     > 0 && <StatBox label="Shares"      value={fmt(ins.shares)}     dark={dark} accent={dark ? "text-blue-400" : "text-blue-600"} />}
                {ins.videoViews > 0 && <StatBox label="Video Views" value={fmt(ins.videoViews)} dark={dark} accent={dark ? "text-blue-400" : "text-blue-600"} />}
              </div>
            </div>
          )}

          {/* CTR benchmark bar */}
          <div className={`rounded-xl px-4 py-3 border ${dark ? "bg-white/[0.02] border-white/[0.05]" : "bg-slate-50 border-black/[0.06]"}`}>
            <div className="flex items-center justify-between mb-2">
              <p className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? "text-white/25" : "text-slate-400"}`}>CTR Benchmark</p>
              <p className={`text-[11px] font-bold ${getCTRAccent(ins.ctr, dark)}`}>{fmtPct(ins.ctr)}</p>
            </div>
            <div className={`w-full h-1.5 rounded-full ${dark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
              <div className={`h-1.5 rounded-full transition-all ${ins.ctr >= 1.5 ? "bg-emerald-500" : ins.ctr >= 0.8 ? "bg-yellow-500" : "bg-red-500"}`}
                style={{ width: `${Math.min((ins.ctr / 3) * 100, 100)}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className={`text-[9px] ${dark ? "text-white/15" : "text-slate-400"}`}>0%</span>
              <span className={`text-[9px] ${dark ? "text-white/15" : "text-slate-400"}`}>Avg 0.8%</span>
              <span className={`text-[9px] ${dark ? "text-white/15" : "text-slate-400"}`}>Good 1.5%</span>
              <span className={`text-[9px] ${dark ? "text-white/15" : "text-slate-400"}`}>3%+</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}