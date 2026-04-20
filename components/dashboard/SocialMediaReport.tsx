"use client";

import { useState, useEffect } from "react";
import { useBoostedPosts, BoostedPost } from "./useBoostedPosts";
import PostModal from "./PostModal";

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
  avgWatchTime?: number | null;
}

interface ReportData {
  fbPosts: Post[];
  igPosts: Post[];
}

interface Props {
  client: string;
  from: string;
  to: string;
  platform: string;
  dark: boolean;
  onBack: () => void;
}

const STEPS = [
  "Connecting to Meta API...",
  "Fetching Facebook posts...",
  "Fetching Instagram posts...",
  "Pulling post insights...",
  "Calculating engagement rates...",
  "Building your report...",
];

const BASE = "https://graph.facebook.com/v25.0";

type SortKey = "default" | "likes" | "comments" | "shares" | "saves" | "reach" | "engagement";

// ─── Helper: safely extract a value from IG media insights ───────────────────
function igVal(data: any[], name: string): number {
  const metric = data?.find((m: any) => m.name === name);
  if (!metric) return 0;
  if (typeof metric.value === "number") return metric.value;
  if (Array.isArray(metric.values) && metric.values.length > 0) {
    return metric.values[0]?.value ?? 0;
  }
  return 0;
}

// ─── Helper: match a post to its boosted entry ────────────────────────────────
function matchBoosted(post: Post, boostedMap: Record<string, BoostedPost>): BoostedPost | null {
  const key = post.message.trim().substring(0, 100).toLowerCase();
  return (
    boostedMap[key] ||
    Object.values(boostedMap).find(
      (b) =>
        b.body.trim().substring(0, 100).toLowerCase() === key ||
        post.message.trim().startsWith(b.body.trim().substring(0, 80)) ||
        b.body.trim().startsWith(post.message.trim().substring(0, 80))
    ) ||
    null
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  organic,
  paid,
  dark,
  accent,
}: {
  label: string;
  value: string;
  organic?: string;
  paid?: string | null;
  dark: boolean;
  accent?: "green" | "red";
}) {
  const hasBreakdown = organic !== undefined;
  const hasPaid = paid && paid !== "0";

  return (
    <div className={`rounded-xl overflow-hidden ${
      dark
        ? "border border-white/[0.08] bg-[#1a1a2e]"
        : "border border-black/20 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
    }`}>
      <div className="px-4 pt-4 pb-3">
        <p className={`text-[10px] font-semibold tracking-[0.12em] uppercase mb-2 ${
          dark ? "text-white/40" : "text-slate-400"
        }`}>
          {label}
        </p>
        <p className={`text-[28px] font-bold leading-none tracking-tight ${
          accent === "green"
            ? "text-emerald-500"
            : accent === "red"
            ? "text-red-500"
            : dark
            ? "text-white"
            : "text-slate-900"
        }`}>
          {value}
        </p>
      </div>

      {hasBreakdown && (
        <div className={`px-4 py-2.5 border-t flex flex-col gap-1.5 ${
          dark
            ? "bg-white/[0.03] border-white/[0.06]"
            : "bg-slate-50 border-black/10"
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                dark ? "bg-white/30" : "bg-slate-400"
              }`} />
              <span className={`text-[10px] font-medium ${
                dark ? "text-white/35" : "text-slate-500"
              }`}>
                Organic
              </span>
            </div>
            <span className={`text-[11px] font-semibold tabular-nums ${
              dark ? "text-white/60" : "text-slate-700"
            }`}>
              {organic}
            </span>
          </div>

          {hasPaid && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400" />
                <span className="text-[10px] font-medium text-amber-600">
                  Paid
                </span>
              </div>
              <span className="text-[11px] font-semibold tabular-nums text-amber-600">
                {paid}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary Section ──────────────────────────────────────────────────────────
function SummarySection({
  title,
  icon,
  posts,
  dark,
  boostedMap,
  follows,
  isFB,
  profileViews,
}: {
  title: string;
  icon: React.ReactNode;
  posts: Post[];
  dark: boolean;
  boostedMap: Record<string, BoostedPost>;
  follows: { follows: number; unfollows: number };
  isFB: boolean;
  profileViews: number;
}) {
  const organicLikes    = posts.reduce((s, p) => s + p.likes, 0);
  const organicComments = posts.reduce((s, p) => s + p.comments, 0);
  const organicShares   = posts.reduce((s, p) => s + p.shares, 0);
  const organicReach    = posts.reduce((s, p) => s + p.reach, 0);

  // For FB: reactions/comments/shares from the Graph API already include boosted
  // engagement on the same post object — do NOT add paid on top (double-count).
  // For IG: paid metrics are additive and must be added.
  // Reach is always additive for both platforms.
  const paidLikes    = isFB ? 0 : posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidLikes    || 0), 0);
  const paidComments = isFB ? 0 : posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidComments || 0), 0);
  const paidShares   = isFB ? 0 : posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidShares   || 0), 0);
  const paidReach    = posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.reach || 0), 0);

  const net = follows.follows - follows.unfollows;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 px-1">
        {icon}
        <h3 className={`text-[12px] font-bold tracking-[0.14em] uppercase ${
          dark ? "text-white/50" : "text-black/40"
        }`}>
          {title}
        </h3>
        <div className={`flex-1 h-px ${dark ? "bg-white/[0.06]" : "bg-black/[0.06]"}`} />
        <span className={`text-[11px] font-medium ${dark ? "text-white/25" : "text-black/25"}`}>
          {posts.length} post{posts.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Engagement metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard
          label="Likes"
          value={(organicLikes + paidLikes).toLocaleString()}
          organic={organicLikes.toLocaleString()}
          paid={paidLikes > 0 ? paidLikes.toLocaleString() : null}
          dark={dark}
        />
        <MetricCard
          label="Comments"
          value={(organicComments + paidComments).toLocaleString()}
          organic={organicComments.toLocaleString()}
          paid={paidComments > 0 ? paidComments.toLocaleString() : null}
          dark={dark}
        />
        <MetricCard
          label="Shares"
          value={(organicShares + paidShares).toLocaleString()}
          organic={organicShares.toLocaleString()}
          paid={paidShares > 0 ? paidShares.toLocaleString() : null}
          dark={dark}
        />
        <MetricCard
          label="Reach"
          value={(organicReach + paidReach).toLocaleString()}
          organic={organicReach.toLocaleString()}
          paid={paidReach > 0 ? paidReach.toLocaleString() : null}
          dark={dark}
        />
      </div>

      {/* Audience + Profile/Page Views row */}
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-4 flex-wrap ${
        dark
          ? "border-white/[0.08] bg-[#1a1a2e]"
          : "border-black/20 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
      }`}>
        <span className={`text-[10px] font-semibold tracking-[0.12em] uppercase mr-auto ${
          dark ? "text-white/30" : "text-slate-400"
        }`}>
          Audience
        </span>

        {/* Follows */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-[11px] font-medium ${
            dark ? "text-white/40" : "text-slate-500"
          }`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            Follows
          </div>
          <span className={`text-[15px] font-bold tabular-nums ${
            dark ? "text-white" : "text-slate-900"
          }`}>
            {follows.follows.toLocaleString()}
          </span>
        </div>

        <div className={`w-px h-5 ${dark ? "bg-white/[0.08]" : "bg-black/10"}`} />

        {/* Unfollows */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-[11px] font-medium ${
            dark ? "text-white/40" : "text-slate-500"
          }`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            Unfollows
          </div>
          <span className={`text-[15px] font-bold tabular-nums ${
            dark ? "text-white/70" : "text-slate-700"
          }`}>
            {follows.unfollows.toLocaleString()}
          </span>
        </div>

        <div className={`w-px h-5 ${dark ? "bg-white/[0.08]" : "bg-black/10"}`} />

        {/* Net */}
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>
            Net
          </span>
          <span className={`text-[15px] font-bold tabular-nums ${
            net >= 0 ? "text-emerald-500" : "text-red-500"
          }`}>
            {net >= 0 ? "+" : ""}{net.toLocaleString()}
          </span>
        </div>

        <div className={`w-px h-5 ${dark ? "bg-white/[0.08]" : "bg-black/10"}`} />

        {/* Profile Views (IG) / Page Views (FB) */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-[11px] font-medium ${
            dark ? "text-white/40" : "text-slate-500"
          }`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            {isFB ? "Page Views" : "Profile Views"}
          </div>
          <span className={`text-[15px] font-bold tabular-nums ${
            dark ? "text-white" : "text-slate-900"
          }`}>
            {profileViews > 0 ? profileViews.toLocaleString() : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Post Table ───────────────────────────────────────────────────────────────
function PostTable({
  posts, showSaves, dark, boostedMap, onRowClick, isFB,
}: {
  posts: Post[];
  showSaves: boolean;
  dark: boolean;
  boostedMap: Record<string, BoostedPost>;
  onRowClick: (post: Post, boosted: BoostedPost | null) => void;
  isFB: boolean;
}) {
  if (posts.length === 0)
    return (
      <p className={`text-sm text-center py-10 ${dark ? "text-white/25" : "text-slate-400"}`}>
        No posts found.
      </p>
    );

  const headers = [
    "Preview", "Type", "Boosted", "Date", "Caption",
    "Likes", "Comments", "Shares",
    ...(showSaves ? ["Saves"] : []),
    "Reach", "Eng. Rate",
    ...(showSaves ? ["Avg Watch"] : []),
  ];
  const rightAlign = new Set(["Likes", "Comments", "Shares", "Saves", "Reach", "Eng. Rate", "Avg Watch"]);

  return (
    <div className={`rounded-xl border overflow-hidden ${
      dark ? "border-white/[0.08]" : "border-black/20"
    }`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={
              dark
                ? "bg-[#1a1a2e] border-b border-white/[0.08]"
                : "bg-slate-100 border-b border-black/10"
            }>
              {headers.map((h) => (
                <th
                  key={h}
                  className={`px-4 py-3.5 text-[10px] font-bold tracking-widest uppercase ${
                    rightAlign.has(h) ? "text-right" : "text-left"
                  } ${dark ? "text-white/40" : "text-slate-500"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.map((post, idx) => {
              const boosted = matchBoosted(post, boostedMap);

              // FB: API reactions already include boosted — don't add paid on top.
              // IG: paid metrics are additive.
              // Reach is always additive.
              const totalLikes    = post.likes    + (isFB ? 0 : (boosted?.paidLikes    || 0));
              const totalComments = post.comments + (isFB ? 0 : (boosted?.paidComments || 0));
              const totalShares   = post.shares   + (isFB ? 0 : (boosted?.paidShares   || 0));
              const totalReach    = post.reach    + (boosted?.reach || 0);
              const isEven        = idx % 2 === 0;

              return (
                <tr
                  key={post.id}
                  onClick={() => {
                    console.log("POST KEY:", post.message.trim().substring(0, 60).toLowerCase());
                    console.log("MATCHED:", !!boosted);
                    onRowClick(post, boosted);
                  }}
                  className={`border-t transition-colors cursor-pointer ${
                    dark
                      ? `border-white/[0.05] ${isEven ? "bg-white/[0.01]" : "bg-transparent"} hover:bg-white/[0.04]`
                      : `border-black/[0.06] ${isEven ? "bg-white" : "bg-slate-50/60"} hover:bg-blue-50/50`
                  }`}
                >
                  {/* Preview */}
                  <td className="px-4 py-3">
                    {post.thumbnail ? (
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                        <img src={post.thumbnail} alt="" className="w-full h-full object-cover" />
                        {post.type === "REEL" && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        dark ? "bg-white/[0.06]" : "bg-slate-200"
                      }`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                          className={dark ? "text-white/25" : "text-slate-400"}>
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full tracking-widest uppercase ${
                      post.type === "REEL"
                        ? dark ? "bg-purple-500/20 text-purple-300" : "bg-purple-100 text-purple-700"
                        : post.type === "CAROUSEL"
                        ? dark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"
                        : dark ? "bg-white/[0.08] text-white/40" : "bg-slate-200 text-slate-600"
                    }`}>
                      {post.type}
                    </span>
                  </td>

                  {/* Boosted */}
                  <td className="px-4 py-3">
                    {!boosted ? (
                      <span className={`text-[11px] ${dark ? "text-white/20" : "text-slate-300"}`}>—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${
                          dark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-700"
                        }`}>
                          BOOSTED
                        </span>
                        <span className={`text-[10px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>
                          ₹{parseFloat(boosted.amountSpent).toLocaleString()}
                        </span>
                        <span className={`text-[10px] font-medium ${
                          boosted.status === "ACTIVE"
                            ? dark ? "text-emerald-400" : "text-emerald-600"
                            : boosted.status === "PAUSED"
                            ? dark ? "text-yellow-400" : "text-yellow-600"
                            : dark ? "text-white/25" : "text-slate-400"
                        }`}>
                          {boosted.status}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Date */}
                  <td className={`px-4 py-3 whitespace-nowrap text-[11px] font-medium ${
                    dark ? "text-white/40" : "text-slate-500"
                  }`}>
                    {new Date(post.createdTime).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>

                  {/* Caption */}
                  <td className={`px-4 py-3 max-w-[180px] text-[12px] ${
                    dark ? "text-white/60" : "text-slate-700"
                  }`}>
                    <p className="truncate">{post.message || "—"}</p>
                  </td>

                  {/* Likes */}
                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${
                    dark ? "text-white/80" : "text-slate-800"
                  }`}>
                    {totalLikes.toLocaleString()}
                  </td>

                  {/* Comments */}
                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${
                    dark ? "text-white/80" : "text-slate-800"
                  }`}>
                    {totalComments.toLocaleString()}
                  </td>

                  {/* Shares */}
                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${
                    dark ? "text-white/80" : "text-slate-800"
                  }`}>
                    {totalShares.toLocaleString()}
                  </td>

                  {/* Saves */}
                  {showSaves && (
                    <td className={`px-4 py-3 text-right text-[13px] font-semibold ${
                      dark ? "text-white/80" : "text-slate-800"
                    }`}>
                      {post.saves.toLocaleString()}
                    </td>
                  )}

                  {/* Reach */}
                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${
                    dark ? "text-white/80" : "text-slate-800"
                  }`}>
                    {totalReach.toLocaleString()}
                  </td>

                  {/* Eng. Rate */}
                  <td className="px-4 py-3 text-right">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      parseFloat(post.engagementRate) >= 3
                        ? dark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                        : parseFloat(post.engagementRate) >= 1
                        ? dark ? "bg-yellow-500/20 text-yellow-300" : "bg-yellow-100 text-yellow-700"
                        : dark ? "bg-red-500/20 text-red-300" : "bg-red-100 text-red-700"
                    }`}>
                      {post.engagementRate}%
                    </span>
                  </td>

                  {/* Avg Watch */}
                  {showSaves && (
                    <td className={`px-4 py-3 text-right text-[13px] font-semibold ${
                      dark ? "text-purple-300" : "text-purple-600"
                    }`}>
                      {post.type === "REEL" && post.avgWatchTime != null ? `${post.avgWatchTime}s` : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SocialMediaReport({ client, from, to, platform, dark, onBack }: Props) {
  const [loading, setLoading]     = useState(true);
  const [step, setStep]           = useState(0);
  const [progress, setProgress]   = useState(0);
  const [data, setData]           = useState<ReportData | null>(null);
  const [error, setError]         = useState("");
  const [activeTab, setActiveTab] = useState<"FB" | "IG">(platform === "IG" ? "IG" : "FB");
  const [search, setSearch]       = useState("");
  const [sortKey, setSortKey]     = useState<SortKey>("default");
  const { boostedMap }            = useBoostedPosts(client, from, to);
  const [selectedPost, setSelectedPost]       = useState<Post | null>(null);
  const [selectedBoosted, setSelectedBoosted] = useState<BoostedPost | null>(null);
  const [cfgToken, setCfgToken]   = useState("");
  const [fbFollows, setFbFollows]           = useState({ follows: 0, unfollows: 0 });
  const [igFollows, setIgFollows]           = useState({ follows: 0, unfollows: 0 });
  const [fbPageViews, setFbPageViews]       = useState(0);
  const [igProfileViews, setIgProfileViews] = useState(0);

  useEffect(() => { fetchReport(); }, []);

  const fetchReport = async () => {
    setLoading(true);
    setData(null);
    setError("");
    setStep(0);
    setProgress(0);

    let cfg: { token: string; fbPageId: string; igUserId: string };
    try {
      const cfgRes = await fetch(`/api/social-media?client=${client}`);
      cfg = await cfgRes.json();
      setCfgToken(cfg.token);
      if (!cfg.token) { setError("Invalid client config"); setLoading(false); return; }

      // ── FB follows / unfollows ─────────────────────────────────────────────
      fetch(`${BASE}/${cfg.fbPageId}/insights?metric=page_daily_follows_unique,page_daily_unfollows_unique&period=day&since=${from}&until=${to}&access_token=${cfg.token}`)
        .then(r => r.json())
        .then(d => {
          const fw = d?.data?.find((m: any) => m.name === "page_daily_follows_unique");
          const uf = d?.data?.find((m: any) => m.name === "page_daily_unfollows_unique");
          setFbFollows({
            follows:   fw?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0,
            unfollows: uf?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0,
          });
        }).catch(() => {});

      // ── FB page views total ────────────────────────────────────────────────
      // Returns values[] one entry per day — sum them across the date range.
      fetch(`${BASE}/${cfg.fbPageId}/insights?metric=page_views_total&period=day&since=${from}&until=${to}&access_token=${cfg.token}`)
        .then(r => r.json())
        .then(d => {
          const metric = d?.data?.find((m: any) => m.name === "page_views_total");
          const total  = metric?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0;
          setFbPageViews(total);
        }).catch(() => {});

      // ── IG follows / unfollows ─────────────────────────────────────────────
      fetch(`${BASE}/${cfg.igUserId}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=${from}&until=${to}&access_token=${cfg.token}`)
        .then(r => r.json())
        .then(d => {
          const breakdown = d?.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
          setIgFollows({
            follows:   breakdown.find((b: any) => b.dimension_values?.[0] === "FOLLOWER")?.value    || 0,
            unfollows: breakdown.find((b: any) => b.dimension_values?.[0] === "NON_FOLLOWER")?.value || 0,
          });
        }).catch(() => {});

      // ── IG profile views ───────────────────────────────────────────────────
      // Uses metric_type=total_value — the total sits at data[0].total_value.value (not values[]).
      fetch(`${BASE}/${cfg.igUserId}/insights?metric=profile_views&metric_type=total_value&period=day&since=${from}&until=${to}&access_token=${cfg.token}`)
        .then(r => r.json())
        .then(d => {
          const total = d?.data?.[0]?.total_value?.value || 0;
          setIgProfileViews(total);
        }).catch(() => {});

    } catch {
      setError("Failed to load client config");
      setLoading(false);
      return;
    }

    try {
      let fbPosts: Post[] = [];
      let igPosts: Post[] = [];

      setStep(0); setProgress(10);
      await new Promise(r => setTimeout(r, 400));

      // ── Facebook posts ─────────────────────────────────────────────────────
      if (platform === "FB" || platform === "BOTH") {
        setStep(1); setProgress(20);

        const fbRes = await fetch(
          `${BASE}/${cfg.fbPageId}/posts` +
          `?fields=id,message,created_time,permalink_url,full_picture` +
          `,reactions.summary(total_count)` +
          `,comments.summary(total_count)` +
          `,shares` +
          `,attachments{media_type,media{source}}` +
          `&since=${from}&until=${to}&limit=100&access_token=${cfg.token}`
        );
        const fbData = await fbRes.json();
        const rawFB  = fbData.data || [];

        setStep(3); setProgress(45);
        fbPosts = await Promise.all(rawFB.map(async (post: any) => {
          const isReel   = post.permalink_url?.includes("/reel/") ||
                           post.permalink_url?.includes("/videos/");
          const mediaUrl = post.attachments?.data?.[0]?.media?.source || null;

          // reactions.summary.total_count already includes boosted reactions —
          // it reflects the true total on the post object regardless of paid/organic.
          const likes    = post.reactions?.summary?.total_count ?? 0;
          const comments = post.comments?.summary?.total_count  ?? 0;
          const shares   = post.shares?.count ?? 0;

          try {
            const insRes = await fetch(
              `${BASE}/${post.id}/insights` +
              `?metric=post_impressions_unique` +
              `&access_token=${cfg.token}`
            );
            const ins   = await insRes.json();
            const reach = ins?.data?.find(
              (m: any) => m.name === "post_impressions_unique"
            )?.values?.[0]?.value ?? 0;

            const engagementRate = reach > 0
              ? (((likes + comments + shares) / reach) * 100).toFixed(2)
              : "0.00";

            return {
              id: post.id,
              message: post.message || "",
              createdTime: post.created_time,
              permalink: post.permalink_url,
              thumbnail: post.full_picture || null,
              mediaUrl,
              type: isReel ? "REEL" : "IMAGE",
              reach,
              likes,
              comments,
              shares,
              saves: 0,
              engagementRate,
            };
          } catch {
            return {
              id: post.id,
              message: post.message || "",
              createdTime: post.created_time,
              permalink: post.permalink_url,
              thumbnail: post.full_picture || null,
              mediaUrl,
              type: isReel ? "REEL" : "IMAGE",
              reach: 0,
              likes,
              comments,
              shares,
              saves: 0,
              engagementRate: "0.00",
            };
          }
        }));
      }

      // ── Instagram posts ───────────────────────────────────────────────────
      if (platform === "IG" || platform === "BOTH") {
        setStep(2); setProgress(65);

        const igRes  = await fetch(`${BASE}/${cfg.igUserId}/media?fields=id,caption,media_type,timestamp,permalink,media_url,thumbnail_url&since=${from}&until=${to}&limit=100&access_token=${cfg.token}`);
        const igData = await igRes.json();
        const rawIG  = igData.data || [];

        setStep(4); setProgress(80);
        igPosts = await Promise.all(rawIG.map(async (post: any) => {
          try {
            const insRes = await fetch(`${BASE}/${post.id}/insights?metric=reach,likes,comments,shares,saved&period=lifetime&access_token=${cfg.token}`);
            const ins    = await insRes.json();

            const reach    = igVal(ins?.data, "reach");
            const likes    = igVal(ins?.data, "likes");
            const comments = igVal(ins?.data, "comments");
            const shares   = igVal(ins?.data, "shares");
            const saves    = igVal(ins?.data, "saved");

            const engagementRate = reach > 0 ? (((likes + comments + shares + saves) / reach) * 100).toFixed(2) : "0.00";
            const mediaType = post.media_type === "VIDEO" ? "REEL" : post.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : "IMAGE";

            const mediaUrl: string | null  = (mediaType === "REEL" || mediaType === "IMAGE") ? (post.media_url || null) : null;
            const thumbnail: string | null = post.thumbnail_url || (mediaType !== "REEL" ? post.media_url : null) || null;

            let avgWatchTime = null;
            if (mediaType === "REEL") {
              try {
                const wRes  = await fetch(`${BASE}/${post.id}/insights?metric=ig_reels_avg_watch_time&period=lifetime&access_token=${cfg.token}`);
                const wData = await wRes.json();
                const val = igVal(wData?.data, "ig_reels_avg_watch_time");
                if (val) avgWatchTime = Math.round(val / 1000);
              } catch {}
            }

            return {
              id: post.id,
              message: post.caption || "",
              createdTime: post.timestamp,
              permalink: post.permalink,
              thumbnail,
              mediaUrl,
              type: mediaType,
              reach, likes, comments, shares, saves,
              engagementRate,
              avgWatchTime,
            };
          } catch {
            return {
              id: post.id,
              message: post.caption || "",
              createdTime: post.timestamp,
              permalink: post.permalink,
              thumbnail: null,
              mediaUrl: null,
              type: "IMAGE",
              reach: 0, likes: 0, comments: 0, shares: 0, saves: 0,
              engagementRate: "0.00",
            };
          }
        }));
      }

      setStep(5); setProgress(100);
      await new Promise(r => setTimeout(r, 300));
      setData({ fbPosts, igPosts });

    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const getTotal = (post: Post, key: "likes" | "comments" | "shares" | "reach") => {
    const b = matchBoosted(post, boostedMap);
    const isFB = activeTab === "FB";
    if (key === "likes")    return post.likes    + (isFB ? 0 : (b?.paidLikes    || 0));
    if (key === "comments") return post.comments + (isFB ? 0 : (b?.paidComments || 0));
    if (key === "shares")   return post.shares   + (isFB ? 0 : (b?.paidShares   || 0));
    if (key === "reach")    return post.reach    + (b?.reach || 0);
    return 0;
  };

  const getFilteredSorted = (posts: Post[]) => {
    let result = posts.filter(p => p.message.toLowerCase().includes(search.toLowerCase()));
    if      (sortKey === "likes")      result = [...result].sort((a, b) => getTotal(b, "likes")    - getTotal(a, "likes"));
    else if (sortKey === "comments")   result = [...result].sort((a, b) => getTotal(b, "comments") - getTotal(a, "comments"));
    else if (sortKey === "shares")     result = [...result].sort((a, b) => getTotal(b, "shares")   - getTotal(a, "shares"));
    else if (sortKey === "saves")      result = [...result].sort((a, b) => b.saves - a.saves);
    else if (sortKey === "reach")      result = [...result].sort((a, b) => getTotal(b, "reach")    - getTotal(a, "reach"));
    else if (sortKey === "engagement") result = [...result].sort((a, b) => parseFloat(b.engagementRate) - parseFloat(a.engagementRate));
    return result;
  };

  const fromLabel = new Date(from).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const toLabel   = new Date(to).toLocaleDateString("en-IN",   { day: "2-digit", month: "short", year: "numeric" });

  const sortTabs: { key: SortKey; label: string }[] = [
    { key: "default",    label: "Latest" },
    { key: "likes",      label: "Top Likes" },
    { key: "comments",   label: "Top Comments" },
    { key: "shares",     label: "Top Shares" },
    { key: "saves",      label: "Top Saves" },
    { key: "reach",      label: "Top Reach" },
    { key: "engagement", label: "Top Engagement" },
  ];

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className={`w-full max-w-sm rounded-full h-1.5 ${dark ? "bg-white/[0.06]" : "bg-black/[0.06]"}`}>
        <div className="h-1.5 rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              i < step ? "bg-blue-500" : i === step ? "bg-blue-400 scale-125" : dark ? "bg-white/10" : "bg-black/10"
            }`} />
          ))}
        </div>
        <p className={`text-[13px] font-medium ${dark ? "text-white/60" : "text-black/50"}`}>{STEPS[step]}</p>
        <p className={`text-[11px] ${dark ? "text-white/25" : "text-black/25"}`}>{progress}% complete</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center gap-4 py-16">
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 shrink-0">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-[13px] text-red-400">{error}</p>
      </div>
      <button onClick={onBack} className={`text-[12px] px-4 py-2 rounded-lg border transition-all ${dark ? "border-white/10 text-white/40 hover:text-white/80" : "border-black/10 text-black/40 hover:text-black/70"}`}>
        ← Back
      </button>
    </div>
  );

  if (!data) return null;

  const activePosts = getFilteredSorted(activeTab === "FB" ? data.fbPosts : data.igPosts);
  const showSaves   = activeTab === "IG";

  return (
    <div className="w-full max-w-[1200px] mx-auto flex flex-col gap-6 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onBack}
          className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition-all ${
            dark ? "border-white/10 text-white/40 hover:text-white/80 hover:border-white/20" : "border-black/10 text-black/40 hover:text-black/70"
          }`}
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-black/10"}`} />
          <span className={`text-[11px] tracking-widest uppercase font-medium ${dark ? "text-white/25" : "text-black/25"}`}>
            Social Media Report · {fromLabel} — {toLabel}
          </span>
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-black/10"}`} />
        </div>
        <div className="w-16" />
      </div>

      {/* FB Summary */}
      {(platform === "FB" || platform === "BOTH") && (
        <SummarySection
          title="Facebook"
          isFB={true}
          profileViews={fbPageViews}
          icon={
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="white">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
            </div>
          }
          posts={data.fbPosts}
          dark={dark}
          boostedMap={boostedMap}
          follows={fbFollows}
        />
      )}

      {/* IG Summary */}
      {(platform === "IG" || platform === "BOTH") && (
        <SummarySection
          title="Instagram"
          isFB={false}
          profileViews={igProfileViews}
          icon={
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <rect x="2" y="2" width="20" height="20" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none" />
              </svg>
            </div>
          }
          posts={data.igPosts}
          dark={dark}
          boostedMap={boostedMap}
          follows={igFollows}
        />
      )}

      {/* Divider */}
      <div className={`h-px w-full ${dark ? "bg-white/[0.05]" : "bg-black/[0.05]"}`} />

      {/* Search + Sort */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${dark ? "text-white/25" : "text-black/25"}`}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by caption..."
            className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm transition-all focus:outline-none ${
              dark
                ? "bg-white/[0.03] border border-white/[0.07] text-white placeholder:text-white/20 focus:border-blue-500/40"
                : "bg-white/80 border border-slate-200 text-[#0a0a14] placeholder:text-black/20 focus:border-blue-500/40"
            }`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {sortTabs.map(tab =>
            tab.key === "saves" && platform === "FB" ? null : (
              <button
                key={tab.key}
                onClick={() => setSortKey(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all duration-200 ${
                  sortKey === tab.key
                    ? "bg-blue-600 text-white shadow-[0_2px_10px_rgba(59,130,246,0.3)]"
                    : dark ? "bg-white/[0.04] text-white/35 hover:text-white/60 border border-white/[0.06]"
                    : "bg-black/[0.04] text-black/35 hover:text-black/60 border border-black/[0.06]"
                }`}
              >
                {tab.label}
              </button>
            )
          )}
        </div>
      </div>

      {/* Platform toggle */}
      {platform === "BOTH" && (
        <div className={`flex rounded-xl p-1 gap-1 w-fit ${dark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-black/[0.03] border border-black/[0.06]"}`}>
          <button
            onClick={() => setActiveTab("FB")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200 ${
              activeTab === "FB" ? "bg-blue-600 text-white shadow-[0_2px_12px_rgba(59,130,246,0.3)]"
              : dark ? "text-white/40 hover:text-white/70" : "text-black/40 hover:text-black/70"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
            </svg>
            Facebook ({data.fbPosts.length})
          </button>
          <button
            onClick={() => setActiveTab("IG")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200 ${
              activeTab === "IG" ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_2px_12px_rgba(168,85,247,0.3)]"
              : dark ? "text-white/40 hover:text-white/70" : "text-black/40 hover:text-black/70"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
            </svg>
            Instagram ({data.igPosts.length})
          </button>
        </div>
      )}

      {/* Table */}
      <PostTable
        posts={activePosts}
        showSaves={showSaves}
        dark={dark}
        boostedMap={boostedMap}
        isFB={activeTab === "FB"}
        onRowClick={(post, boosted) => { setSelectedPost(post); setSelectedBoosted(boosted); }}
      />

      {/* Modal */}
      {selectedPost && (
        <PostModal
          post={selectedPost}
          boosted={selectedBoosted}
          onClose={() => { setSelectedPost(null); setSelectedBoosted(null); }}
          dark={dark}
          showSaves={showSaves}
          platform={activeTab}
          token={cfgToken}
        />
      )}
    </div>
  );
}