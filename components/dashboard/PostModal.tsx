// C:\Users\Varun Shetty\Desktop\New folder\bludash\components\dashboard\PostModal.tsx
"use client";

import { useEffect, useState } from "react";
import { BoostedPost } from "./useBoostedPosts";

interface Post {
  id: string;
  message: string;
  createdTime: string;
  permalink: string;
  thumbnail: string | null;
  mediaUrl: string | null;
  type: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: string;
}

interface Props {
  post: Post | null;
  boosted: BoostedPost | null;
  onClose: () => void;
  dark: boolean;
  showSaves: boolean;
  platform: string;
  token: string;
}

const BASE = "https://graph.facebook.com/v25.0";

function StatBox({
  label, value, sub, accent, dark,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  dark: boolean;
}) {
  return (
    <div className={`rounded-xl px-4 py-3 flex flex-col gap-0.5 border ${
      dark
        ? "bg-white/[0.03] border-white/[0.05]"
        : "bg-white border-black/10 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
    }`}>
      <p className={`text-[10px] font-semibold tracking-widest uppercase ${
        dark ? "text-white/25" : "text-slate-400"
      }`}>
        {label}
      </p>
      <p className={`text-lg font-bold ${accent || (dark ? "text-white" : "text-slate-900")}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-[10px] ${dark ? "text-white/20" : "text-slate-400"}`}>{sub}</p>
      )}
    </div>
  );
}

export default function PostModal({
  post, boosted, onClose, dark, showSaves, platform, token,
}: Props) {
  const [avgWatchTime, setAvgWatchTime] = useState<number | null>(null);
  const [videoError, setVideoError] = useState(false);

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
    setAvgWatchTime(null);
    setVideoError(false);
  }, [post?.id]);

  useEffect(() => {
    if (!post || post.type !== "REEL" || platform !== "IG" || !token) return;
    fetch(`${BASE}/${post.id}/insights?metric=ig_reels_avg_watch_time&period=lifetime&access_token=${token}`)
      .then(r => r.json())
      .then(d => {
        const val = d?.data?.[0]?.values?.[0]?.value;
        if (val) setAvgWatchTime(Math.round(val / 1000));
      })
      .catch(() => {});
  }, [post?.id]);

  if (!post) return null;

  const isReel      = post.type === "REEL";
  const isBoosted   = !!boosted;
  const amountSpent = boosted ? parseFloat(boosted.amountSpent) : 0;

  const date = new Date(post.createdTime).toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // For IG reels, proxy through our API to avoid CORS issues
  const getVideoSrc = () => {
    if (!post.mediaUrl) return null;
    if (platform === "IG") {
      return `/api/proxy-video?url=${encodeURIComponent(post.mediaUrl)}`;
    }
    return post.mediaUrl; // FB URLs work directly
  };

  const renderFallback = () => (
    <div
      className="w-full bg-black rounded-t-2xl overflow-hidden relative flex items-center justify-center"
      style={{ minHeight: 300 }}
    >
      {post.thumbnail && (
        <img
          src={post.thumbnail}
          alt=""
          style={{ width: "100%", maxHeight: 400, objectFit: "cover", display: "block", opacity: 0.4 }}
        />
      )}
      
        <a 
        href={post.permalink}
        target="_blank"
        rel="noreferrer"
        onClick={e => e.stopPropagation()}
        style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 12, textDecoration: "none",
        }}
      >
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
          dark ? "bg-white/10" : "bg-black/20"
        }`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="white">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
        <span style={{
          fontSize: 12, color: "#fff", fontWeight: 700,
          background: "rgba(0,0,0,0.55)", padding: "5px 14px", borderRadius: 99,
        }}>
          Watch on {platform === "IG" ? "Instagram" : "Facebook"}
        </span>
      </a>
    </div>
  );

  const renderMedia = () => {
    if (isReel) {
      const videoSrc = getVideoSrc();

      if (videoSrc && !videoError) {
        return (
          <div
            className="w-full bg-black rounded-t-2xl overflow-hidden flex items-center justify-center"
            style={{ minHeight: 400 }}
          >
            <video
              key={post.id}
              src={videoSrc}
              controls
              playsInline
              preload="metadata"
              poster={post.thumbnail ?? undefined}
              onError={() => setVideoError(true)}
              style={{
                width: "100%",
                maxHeight: 520,
                objectFit: "contain",
                background: "#000",
                display: "block",
              }}
            />
          </div>
        );
      }

      // No video URL or video failed to load
      return renderFallback();
    }

    // Image / Carousel
    if (post.thumbnail) {
      return (
        <div className={`w-full aspect-video flex items-center justify-center rounded-t-2xl overflow-hidden ${
          dark ? "bg-black/60" : "bg-black/10"
        }`}>
          <img src={post.thumbnail} alt="" className="w-full h-full object-contain" />
        </div>
      );
    }

    // No preview
    return (
      <div className={`w-full aspect-video flex flex-col items-center justify-center gap-2 rounded-t-2xl ${
        dark ? "bg-black/60" : "bg-slate-100"
      }`}>
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1" className={dark ? "text-white/20" : "text-slate-300"}>
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <p className={`text-xs ${dark ? "text-white/20" : "text-slate-400"}`}>No preview</p>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className={`fixed inset-0 ${dark ? "bg-black/80" : "bg-black/40"} backdrop-blur-sm`} />

      {/* Modal */}
      <div
        className={`relative w-full max-w-[640px] rounded-2xl shadow-2xl flex flex-col my-auto ${
          dark
            ? "bg-[#0e0e1a] border border-white/[0.07]"
            : "bg-white border border-black/[0.08]"
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Top accent line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-blue-500/60 to-transparent rounded-full" />

        {/* Close button */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 p-1.5 rounded-lg transition-all z-10 ${
            dark
              ? "text-white/30 hover:text-white/80 hover:bg-white/[0.06]"
              : "text-black/30 hover:text-black/70 hover:bg-black/[0.05]"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Media */}
        {renderMedia()}

        {/* Content */}
        <div className="flex flex-col gap-5 p-6">

          {/* Header row */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-widest uppercase ${
                  post.type === "REEL"
                    ? dark ? "bg-purple-500/15 text-purple-400" : "bg-purple-100 text-purple-700"
                    : post.type === "CAROUSEL"
                    ? dark ? "bg-blue-500/15 text-blue-400" : "bg-blue-100 text-blue-700"
                    : dark ? "bg-white/[0.06] text-white/35" : "bg-slate-100 text-slate-600"
                }`}>
                  {post.type}
                </span>
                {isBoosted && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    dark ? "bg-amber-500/15 text-amber-400" : "bg-amber-100 text-amber-700"
                  }`}>
                    BOOSTED · ₹{amountSpent.toLocaleString()}
                  </span>
                )}
                {isBoosted && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    boosted!.status === "ACTIVE"
                      ? dark ? "bg-green-500/15 text-green-400" : "bg-green-100 text-green-700"
                      : boosted!.status === "PAUSED"
                      ? dark ? "bg-yellow-500/15 text-yellow-400" : "bg-yellow-100 text-yellow-700"
                      : dark ? "bg-white/[0.06] text-white/30" : "bg-slate-100 text-slate-500"
                  }`}>
                    {boosted!.status}
                  </span>
                )}
              </div>
              <p className={`text-[11px] ${dark ? "text-white/25" : "text-slate-400"}`}>{date}</p>
            </div>

            <a 
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className={`text-[11px] px-3 py-1.5 rounded-lg border flex items-center gap-1.5 shrink-0 transition-all ${
                dark
                  ? "border-white/10 text-white/40 hover:text-white/80"
                  : "border-black/10 text-slate-500 hover:text-slate-800"
              }`}
            >
              View Post
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>

          {/* Caption */}
          {post.message && (
            <div className={`rounded-xl px-4 py-3 text-[12px] leading-relaxed max-h-20 overflow-y-auto ${
              dark
                ? "bg-white/[0.03] text-white/50 border border-white/[0.05]"
                : "bg-slate-50 text-slate-600 border border-black/10"
            }`}>
              {post.message}
            </div>
          )}

          {/* Organic metrics */}
          <div className="flex flex-col gap-2">
            <p className={`text-[10px] font-bold tracking-widest uppercase ${
              dark ? "text-white/25" : "text-slate-400"
            }`}>
              Organic Performance
            </p>
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Reach"    value={post.reach.toLocaleString()}    dark={dark} />
              <StatBox label="Likes"    value={post.likes.toLocaleString()}    dark={dark} />
              <StatBox label="Comments" value={post.comments.toLocaleString()} dark={dark} />
              <StatBox label="Shares"   value={post.shares.toLocaleString()}   dark={dark} />
              {showSaves && (
                <StatBox label="Saves" value={post.saves.toLocaleString()} dark={dark} />
              )}
              <StatBox
                label="Eng. Rate"
                value={`${post.engagementRate}%`}
                dark={dark}
                accent={
                  parseFloat(post.engagementRate) >= 3
                    ? dark ? "text-emerald-400" : "text-emerald-600"
                    : parseFloat(post.engagementRate) >= 1
                    ? dark ? "text-yellow-400" : "text-yellow-600"
                    : dark ? "text-red-400" : "text-red-600"
                }
              />
              {avgWatchTime !== null && (
                <StatBox
                  label="Avg Watch"
                  value={`${avgWatchTime}s`}
                  dark={dark}
                  accent={dark ? "text-purple-400" : "text-purple-600"}
                />
              )}
            </div>
          </div>

          {/* Paid metrics */}
          {isBoosted && (
            <div className="flex flex-col gap-2">
              <p className={`text-[10px] font-bold tracking-widest uppercase ${
                dark ? "text-amber-500/70" : "text-amber-600"
              }`}>
                Paid Performance
              </p>
              <div className="grid grid-cols-3 gap-2">
                <StatBox label="Paid Reach"    value={boosted!.reach.toLocaleString()}       dark={dark} accent={dark ? "text-amber-400" : "text-amber-600"} />
                <StatBox label="Impressions"   value={boosted!.impressions.toLocaleString()}  dark={dark} accent={dark ? "text-amber-400" : "text-amber-600"} />
                <StatBox label="Link Clicks"   value={boosted!.clicks.toLocaleString()}       dark={dark} accent={dark ? "text-amber-400" : "text-amber-600"} />
                <StatBox label="Paid Likes"    value={boosted!.paidLikes.toLocaleString()}    dark={dark} accent={dark ? "text-amber-400" : "text-amber-600"} />
                <StatBox label="Paid Comments" value={boosted!.paidComments.toLocaleString()} dark={dark} accent={dark ? "text-amber-400" : "text-amber-600"} />
                <StatBox label="Paid Shares"   value={boosted!.paidShares.toLocaleString()}   dark={dark} accent={dark ? "text-amber-400" : "text-amber-600"} />
                <StatBox label="Amount Spent"  value={`₹${amountSpent.toLocaleString()}`}     dark={dark} accent={dark ? "text-amber-400" : "text-amber-600"} />
                <StatBox label="CPM"           value={`₹${boosted!.cpm}`}                     dark={dark} accent={dark ? "text-amber-400" : "text-amber-600"} />
                <StatBox label="CTR"           value={`${boosted!.ctr}%`}                     dark={dark} accent={dark ? "text-amber-400" : "text-amber-600"} />
              </div>
            </div>
          )}

          {/* Combined */}
          {isBoosted && (
            <div className="flex flex-col gap-2">
              <p className={`text-[10px] font-bold tracking-widest uppercase ${
                dark ? "text-blue-400/70" : "text-blue-600"
              }`}>
                Combined
              </p>
              <div className="grid grid-cols-3 gap-2">
                <StatBox label="Total Reach"    value={(post.reach    + boosted!.reach).toLocaleString()}        dark={dark} accent={dark ? "text-blue-400" : "text-blue-600"} />
                <StatBox label="Total Likes"    value={(post.likes    + boosted!.paidLikes).toLocaleString()}    dark={dark} accent={dark ? "text-blue-400" : "text-blue-600"} />
                <StatBox label="Total Comments" value={(post.comments + boosted!.paidComments).toLocaleString()} dark={dark} accent={dark ? "text-blue-400" : "text-blue-600"} />
                <StatBox label="Total Shares"   value={(post.shares   + boosted!.paidShares).toLocaleString()}   dark={dark} accent={dark ? "text-blue-400" : "text-blue-600"} />
              </div>
            </div>
          )}

          {/* Ad name */}
          {isBoosted && (
            <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
              dark
                ? "bg-amber-500/[0.04] border-amber-500/[0.12]"
                : "bg-amber-50 border-amber-200"
            }`}>
              <span className={`text-[11px] font-semibold tracking-widest uppercase ${
                dark ? "text-amber-500/70" : "text-amber-600"
              }`}>
                Ad Name
              </span>
              <span className={`text-[12px] font-medium ${
                dark ? "text-amber-400" : "text-amber-700"
              }`}>
                {boosted!.adName}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}