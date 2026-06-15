"use client";
// components/dashboard/SocialMediaReport.tsx

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { getPreviousMonthComparisonRange } from "@/lib/dateComparison";
import { useBoostedPosts, BoostedPost } from "./useBoostedPosts";
import PostModal from "./PostModal";
import ManusReportToast from "./ManusReportToast";
import { buildSocialReportPayload } from "@/lib/buildSocialReportPayload";
import { generateSocialReportPDF } from "@/lib/generateSocialReportPDF";
import { findBoostedMatch } from "@/lib/boostedPostMatch";

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
  views: number;
  engagementRate: string;
  avgWatchTime?: number | null;
  skipRate?: number | null; // reels_skip_rate — % of viewers who skipped in first 3s
  holdRate?: number | null;
}

interface ReportData {
  fbPosts: Post[];
  igPosts: Post[];
}

interface ReachBreakdown {
  total: number;
  organic: number;
  paid: number;
}

interface Props {
  client: string;
  from: string;
  to: string;
  platform: string;
  dark: boolean;
  onBack: () => void;
}

type SocialMediaConfig = {
  token: string;
  fbPageId: string | null;
  igUserId: string | null;
  igProfileUrl?: string | null;
  igUsername?: string | null;
  igResolveError?: string;
  missing?: string[];
  error?: string;
};

type PublicInstagramProfile = {
  username: string;
  profileUrl: string;
  reason: string;
  fullName?: string;
  biography?: string;
  profilePic?: string | null;
  followers?: number | null;
  totalPosts?: number | null;
  posts: PublicInstagramPost[];
  summary: {
    posts: number;
    likes: number;
    comments: number;
    shares: null;
  };
  coverage?: {
    fetchedPosts: number;
    scrapedPosts?: number;
    manualPosts?: number;
    pagesFetched: number;
    maxPages: number;
    moreAvailable: boolean;
    limited: boolean;
    source?: string;
    warning?: string;
    rangeFullyCovered?: boolean;
    hitPageCap?: boolean;
    oldestPostDate?: string | null;
    newestPostDate?: string | null;
  };
  scrapeError?: string;
};

type PublicInstagramPost = {
  id: string;
  shortcode: string;
  caption: string;
  timestamp: number;
  createdTime: string;
  permalink: string;
  thumbnail: string | null;
  type: string;
  likes: number | null;
  comments: number | null;
  shares: null;
  source?: "instagram" | "manual";
};

type PublicInstagramApiResponse = {
  profile?: {
    username?: string;
    fullName?: string;
    biography?: string;
    profilePic?: string | null;
    followers?: number | null;
    totalPosts?: number | null;
    profileUrl?: string;
  };
  posts?: PublicInstagramPost[];
  summary?: PublicInstagramProfile["summary"];
  coverage?: PublicInstagramProfile["coverage"];
  error?: string;
};

type MetaInsightPoint = {
  value?: number | string;
};

type MetaInsightMetric = {
  name?: string;
  values?: MetaInsightPoint[];
};

type MetaInsightsPayload = {
  data?: MetaInsightMetric[];
};

const STEPS = [
  "Connecting to Meta API...",
  "Fetching Facebook posts...",
  "Fetching Instagram posts...",
  "Pulling post insights...",
  "Calculating engagement rates...",
  "Building your report...",
];

const BASE = "https://graph.facebook.com/v25.0";
const META_FETCH_TIMEOUT_MS = 15000;
const AUDIENCE_FETCH_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = META_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

const SOCIAL_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const socialConfigCache = new Map<
  string,
  { expiresAt: number; value: SocialMediaConfig }
>();
const socialConfigInFlight = new Map<string, Promise<SocialMediaConfig>>();

async function getSocialMediaConfig(client: string): Promise<SocialMediaConfig> {
  const cached = socialConfigCache.get(client);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) socialConfigCache.delete(client);

  const pending = socialConfigInFlight.get(client);
  if (pending) return pending;

  const request = fetch(`/api/social-media?client=${client}`)
    .then((res) => res.json() as Promise<SocialMediaConfig>)
    .then((cfg) => {
      socialConfigCache.set(client, {
        expiresAt: Date.now() + SOCIAL_CONFIG_CACHE_TTL_MS,
        value: cfg,
      });
      return cfg;
    })
    .finally(() => {
      socialConfigInFlight.delete(client);
    });

  socialConfigInFlight.set(client, request);
  return request;
}

function instagramProfileUrl(username: string, fallback?: string | null): string {
  if (fallback?.startsWith("http")) return fallback;
  return username ? `https://www.instagram.com/${username}/` : "";
}

function publicInstagramFallback(
  cfg: SocialMediaConfig,
  platform: string,
  client: string
): PublicInstagramProfile | null {
  if (cfg.token || (platform !== "IG" && platform !== "BOTH")) return null;

  const username =
    cfg.igUsername ||
    cfg.igProfileUrl?.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").split(/[/?#]/)[0] ||
    "";
  const profileUrl = instagramProfileUrl(username, cfg.igProfileUrl);
  if (!username && !profileUrl) return null;

  return {
    username,
    profileUrl,
    reason: `No ${client}_TOKEN is configured, so only public profile context is available.`,
    posts: [],
    summary: {
      posts: 0,
      likes: 0,
      comments: 0,
      shares: null,
    },
  };
}

async function fetchPublicInstagramReport(
  client: string,
  from: string,
  to: string,
  fallback: PublicInstagramProfile
): Promise<PublicInstagramProfile> {
  try {
    const params = new URLSearchParams({ client, from, to });
    const res = await fetch(`/api/public-instagram?${params.toString()}`);
    const json = (await res.json()) as PublicInstagramApiResponse;

    if (!res.ok || json.error) {
      return {
        ...fallback,
        scrapeError: json.error || "Could not fetch public Instagram posts.",
      };
    }

    return {
      ...fallback,
      username: json.profile?.username || fallback.username,
      profileUrl: json.profile?.profileUrl || fallback.profileUrl,
      fullName: json.profile?.fullName || "",
      biography: json.profile?.biography || "",
      profilePic: json.profile?.profilePic || null,
      followers: json.profile?.followers ?? null,
      totalPosts: json.profile?.totalPosts ?? null,
      posts: json.posts || [],
      summary: json.summary || fallback.summary,
      coverage: json.coverage,
    };
  } catch {
    return {
      ...fallback,
      scrapeError: "Could not fetch public Instagram posts.",
    };
  }
}

function socialConfigError(
  cfg: SocialMediaConfig,
  platform: string,
  client: string
): string | null {
  if (cfg.error) return cfg.error;

  if (!cfg.token) {
    return `Missing Meta token for ${client}. Add ${client}_TOKEN; an Instagram URL or username alone cannot fetch report insights.`;
  }

  if ((platform === "FB" || platform === "BOTH") && !cfg.fbPageId) {
    return `Missing Facebook Page ID for ${client}. Add ${client}_FB_PAGE_ID.`;
  }

  if ((platform === "IG" || platform === "BOTH") && !cfg.igUserId) {
    const profile = cfg.igUsername
      ? `@${cfg.igUsername}`
      : cfg.igProfileUrl || "this Instagram profile";
    const resolveHint = cfg.fbPageId
      ? "Make sure that profile is the Instagram Business account linked to the configured Facebook Page, or add the numeric IG user ID directly."
      : `Add ${client}_FB_PAGE_ID as well, so the app can try to resolve the linked Instagram Business account.`;
    const metaDetail = cfg.igResolveError ? ` Meta response: ${cfg.igResolveError}` : "";

    return `Missing Instagram Business ID for ${profile}. Add ${client}_IG_USER_ID. ${resolveHint}${metaDetail}`;
  }

  return null;
}

type SortKey =
  | "default"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "reach"
  | "engagement";

function igVal(data: any[], name: string): number {
  const metric = data?.find((m: any) => m.name === name);
  if (!metric) return 0;
  if (typeof metric.value === "number") return metric.value;
  if (Array.isArray(metric.values) && metric.values.length > 0) {
    return metric.values[0]?.value ?? 0;
  }
  return 0;
}

function insightNumber(value: any): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value?.value === "number") return value.value;
  return 0;
}

function peopleFromRate(views: number, rate?: number | null): number {
  if (!views || rate == null) return 0;
  return Math.round((views * rate) / 100);
}

function rateWithPeople(rate: number | null | undefined, views: number): string {
  if (rate == null) return "—";
  return `${rate}% (${peopleFromRate(views, rate).toLocaleString()})`;
}

function sumInsightMetric(metric: any): number {
  if (!metric) return 0;

  if (metric.total_value?.value != null) {
    return insightNumber(metric.total_value.value);
  }

  if (Array.isArray(metric.values)) {
    return metric.values.reduce(
      (sum: number, item: any) => sum + insightNumber(item?.value),
      0
    );
  }

  return insightNumber(metric.value);
}

function parseInstagramFollowStats(payload: any) {
  const results = payload?.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];

  return results.reduce(
    (stats: { follows: number; unfollows: number }, item: any) => {
      const raw = String(item?.dimension_values?.[0] || "")
        .toUpperCase()
        .replace(/[\s-]/g, "_");
      const value = insightNumber(item?.value);

      if (["FOLLOW", "FOLLOWS", "FOLLOWER", "FOLLOWERS"].includes(raw)) {
        stats.follows += value;
      }

      if (
        [
          "UNFOLLOW",
          "UNFOLLOWS",
          "UNFOLLOWER",
          "UNFOLLOWERS",
          "NON_FOLLOWER",
          "NONFOLLOWER",
        ].includes(raw)
      ) {
        stats.unfollows += value;
      }

      return stats;
    },
    { follows: 0, unfollows: 0 }
  );
}

function parseInstagramProfileViews(payload: any): number {
  const metric =
    payload?.data?.find((m: any) => m.name === "profile_views") ||
    payload?.data?.[0];

  return sumInsightMetric(metric);
}

function sumMetricValues(metric?: MetaInsightMetric): number {
  return metric?.values?.reduce((sum, item) => sum + (Number(item.value) || 0), 0) || 0;
}

function facebookAudienceTarget(platform: string, cfg: SocialMediaConfig): string | null {
  return platform === "FB" || platform === "BOTH" ? cfg.fbPageId : null;
}

function instagramAudienceTarget(platform: string, cfg: SocialMediaConfig): string | null {
  return platform === "IG" || platform === "BOTH" ? cfg.igUserId : null;
}

async function fetchAudienceJson(url: string | null): Promise<MetaInsightsPayload | null> {
  if (!url) return null;

  try {
    const res = await fetchWithTimeout(url, undefined, AUDIENCE_FETCH_TIMEOUT_MS);
    return await res.json();
  } catch {
    return null;
  }
}

function matchBoosted(
  post: Post,
  boostedMap: Record<string, BoostedPost>
): BoostedPost | null {
  return findBoostedMatch(post, boostedMap);
}

function exportCSV(params: {
  client: string;
  from: string;
  to: string;
  fbPosts: Post[];
  igPosts: Post[];
  boostedMap: Record<string, BoostedPost>;
  fbFollows: { follows: number; unfollows: number };
  igFollows: { follows: number; unfollows: number };
  fbPageViews: number;
  igProfileViews: number;
  fbReachBreakdown: ReachBreakdown;
  igReachBreakdown: ReachBreakdown;
}) {
  const {
    client,
    from,
    to,
    fbPosts,
    igPosts,
    boostedMap,
    fbFollows,
    igFollows,
    fbPageViews,
    igProfileViews,
    fbReachBreakdown,
    igReachBreakdown,
  } = params;

  const rows: string[] = [];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const row = (cols: (string | number)[]) => rows.push(cols.map(esc).join(","));

  row([`Bludash Social Media Report`]);
  row([`Client: ${client}`, `Period: ${from} to ${to}`]);
  rows.push("");

  row(["FACEBOOK SUMMARY"]);
  const fbOrganicLikes = fbPosts.reduce((s, p) => s + p.likes, 0);
  const fbOrganicComments = fbPosts.reduce((s, p) => s + p.comments, 0);
  const fbOrganicShares = fbPosts.reduce((s, p) => s + p.shares, 0);
  row(["Metric", "Organic", "Paid", "Total"]);
  row(["Likes", fbOrganicLikes, 0, fbOrganicLikes]);
  row(["Comments", fbOrganicComments, 0, fbOrganicComments]);
  row(["Shares", fbOrganicShares, 0, fbOrganicShares]);
  row([
    "Reach",
    fbReachBreakdown.organic,
    fbReachBreakdown.paid,
    fbReachBreakdown.total,
  ]);
  rows.push("");
  row(["Audience", "Follows", "Unfollows", "Net", "Page Views"]);
  row([
    "Facebook",
    fbFollows.follows,
    fbFollows.unfollows,
    fbFollows.follows - fbFollows.unfollows,
    fbPageViews,
  ]);
  rows.push("");

  row(["INSTAGRAM SUMMARY"]);
  const igOrganicLikes = igPosts.reduce((s, p) => s + p.likes, 0);
  const igOrganicComments = igPosts.reduce((s, p) => s + p.comments, 0);
  const igOrganicShares = igPosts.reduce((s, p) => s + p.shares, 0);
  const igPaidLikes = igPosts.reduce(
    (s, p) => s + (matchBoosted(p, boostedMap)?.paidLikes || 0),
    0
  );
  const igPaidComments = igPosts.reduce(
    (s, p) => s + (matchBoosted(p, boostedMap)?.paidComments || 0),
    0
  );
  const igPaidShares = igPosts.reduce(
    (s, p) => s + (matchBoosted(p, boostedMap)?.paidShares || 0),
    0
  );
  row(["Metric", "Organic", "Paid", "Total"]);
  row(["Likes", igOrganicLikes, igPaidLikes, igOrganicLikes + igPaidLikes]);
  row([
    "Comments",
    igOrganicComments,
    igPaidComments,
    igOrganicComments + igPaidComments,
  ]);
  row(["Shares", igOrganicShares, igPaidShares, igOrganicShares + igPaidShares]);
  row([
    "Reach",
    igReachBreakdown.organic,
    igReachBreakdown.paid,
    igReachBreakdown.total,
  ]);
  rows.push("");
  row(["Audience", "Follows", "Unfollows", "Net", "Profile Views"]);
  row([
    "Instagram",
    igFollows.follows,
    igFollows.unfollows,
    igFollows.follows - igFollows.unfollows,
    igProfileViews,
  ]);
  rows.push("");

  row(["FACEBOOK POSTS"]);
  if (fbPosts.length === 0) {
    row(["No Facebook posts in this period."]);
  } else {
    row([
      "Date",
      "Type",
      "Caption",
      "Likes",
      "Comments",
      "Shares",
      "Views",
      "Reach",
      "Skip People",
      "Hold People",
      "Eng. Rate (%)",
      "Boosted",
      "Amount Spent",
      "Paid Reach",
      "Impressions",
      "Link Clicks",
      "CPM",
      "CTR (%)",
      "Ad Name",
      "Post Link",
    ]);
    for (const p of fbPosts) {
      const b = matchBoosted(p, boostedMap);
      row([
        new Date(p.createdTime).toLocaleDateString("en-IN"),
        p.type,
        p.message,
        p.likes,
        p.comments,
        p.shares,
        p.type === "REEL" ? p.views : "",
        p.reach + (b?.reach || 0),
        p.type === "REEL" ? peopleFromRate(p.views, p.skipRate) : "",
        p.type === "REEL" ? peopleFromRate(p.views, p.holdRate) : "",
        p.engagementRate,
        b ? "Yes" : "No",
        b ? parseFloat(b.amountSpent).toLocaleString() : "",
        b ? b.reach : "",
        b ? b.impressions : "",
        b ? b.clicks : "",
        b ? b.cpm : "",
        b ? b.ctr : "",
        b ? b.adName : "",
        p.permalink,
      ]);
    }
  }
  rows.push("");

  row(["INSTAGRAM POSTS"]);
  if (igPosts.length === 0) {
    row(["No Instagram posts in this period."]);
  } else {
    row([
      "Date",
      "Type",
      "Caption",
      "Likes",
      "Comments",
      "Shares",
      "Saves",
      "Views",
      "Reach",
      "Eng. Rate (%)",
      "Avg Watch (s)",
      "Skip Rate (%)",
      "Hold Rate (%)",
      "Skip People",
      "Hold People",
      "Boosted",
      "Amount Spent",
      "Paid Reach",
      "Impressions",
      "Link Clicks",
      "Paid Likes",
      "Paid Comments",
      "Paid Shares",
      "CPM",
      "CTR (%)",
      "Ad Name",
      "Post Link",
    ]);
    for (const p of igPosts) {
      const b = matchBoosted(p, boostedMap);
      row([
        new Date(p.createdTime).toLocaleDateString("en-IN"),
        p.type,
        p.message,
        p.likes + (b?.paidLikes || 0),
        p.comments + (b?.paidComments || 0),
        p.shares + (b?.paidShares || 0),
        p.saves,
        p.type === "REEL" ? p.views : "",
        p.reach + (b?.reach || 0),
        p.engagementRate,
        p.type === "REEL" && p.avgWatchTime != null ? p.avgWatchTime : "",
        p.type === "REEL" && p.skipRate != null ? p.skipRate : "",
        p.type === "REEL" && p.holdRate != null ? p.holdRate : "",
        p.type === "REEL" ? peopleFromRate(p.views, p.skipRate) : "",
        p.type === "REEL" ? peopleFromRate(p.views, p.holdRate) : "",
        b ? "Yes" : "No",
        b ? parseFloat(b.amountSpent).toLocaleString() : "",
        b ? b.reach : "",
        b ? b.impressions : "",
        b ? b.clicks : "",
        b ? b.paidLikes : "",
        b ? b.paidComments : "",
        b ? b.paidShares : "",
        b ? b.cpm : "",
        b ? b.ctr : "",
        b ? b.adName : "",
        p.permalink,
      ]);
    }
  }

  const csvContent = rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bludash_report_${client}_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPDF(params: {
  client: string;
  from: string;
  to: string;
  fbPosts: Post[];
  igPosts: Post[];
  boostedMap: Record<string, BoostedPost>;
  fbFollows: { follows: number; unfollows: number };
  igFollows: { follows: number; unfollows: number };
  fbPageViews: number;
  igProfileViews: number;
  fbReachBreakdown: ReachBreakdown;
  igReachBreakdown: ReachBreakdown;
}) {
  const {
    client,
    from,
    to,
    fbPosts,
    igPosts,
    boostedMap,
    fbFollows,
    igFollows,
    fbPageViews,
    igProfileViews,
    fbReachBreakdown,
    igReachBreakdown,
  } = params;

  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 14;

  const BLUE = [29, 78, 216] as [number, number, number];
  const PURPLE = [124, 58, 237] as [number, number, number];
  const DARK = [10, 10, 20] as [number, number, number];
  const MUTED = [120, 120, 140] as [number, number, number];
  const LIGHT = [245, 246, 250] as [number, number, number];
  const WHITE = [255, 255, 255] as [number, number, number];
  const GREEN = [16, 185, 129] as [number, number, number];
  const RED = [239, 68, 68] as [number, number, number];
  const AMBER = [217, 119, 6] as [number, number, number];
  const AMBER_LIGHT = [254, 243, 199] as [number, number, number];

  const sectionHeader = (
    title: string,
    color: [number, number, number] = BLUE
  ) => {
    if (y > 175) {
      doc.addPage();
      y = 14;
    }
    doc.setFillColor(...color);
    doc.roundedRect(10, y, pageW - 20, 8, 2, 2, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(title, 15, y + 5.5);
    y += 12;
    doc.setTextColor(...DARK);
  };

  const summaryCards = (
    cards: { label: string; value: string; sub?: string; color?: [number, number, number] }[]
  ) => {
    const cardW = (pageW - 20 - (cards.length - 1) * 3) / cards.length;
    cards.forEach((card, i) => {
      const cx = 10 + i * (cardW + 3);
      doc.setFillColor(...LIGHT);
      doc.roundedRect(cx, y, cardW, 18, 2, 2, "F");
      doc.setTextColor(...MUTED);
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text(card.label.toUpperCase(), cx + 3, y + 5);
      doc.setTextColor(...(card.color || DARK));
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(card.value, cx + 3, y + 12);
      if (card.sub) {
        doc.setTextColor(...MUTED);
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.text(card.sub, cx + 3, y + 17);
      }
    });
    y += 22;
  };

  const audienceBar = (
    follows: number,
    unfollows: number,
    views: number,
    viewsLabel: string
  ) => {
    const net = follows - unfollows;
    doc.setFillColor(...LIGHT);
    doc.roundedRect(10, y, pageW - 20, 12, 2, 2, "F");
    const items = [
      { label: "Follows", value: follows.toLocaleString(), color: DARK },
      { label: "Unfollows", value: unfollows.toLocaleString(), color: DARK },
      {
        label: "Net",
        value: (net >= 0 ? "+" : "") + net.toLocaleString(),
        color: net >= 0 ? GREEN : RED,
      },
      {
        label: viewsLabel,
        value: views > 0 ? views.toLocaleString() : "\u2014",
        color: DARK,
      },
    ];
    const slotW = (pageW - 20) / items.length;
    items.forEach((item, i) => {
      const cx = 10 + i * slotW;
      doc.setTextColor(...MUTED);
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text(item.label.toUpperCase(), cx + 4, y + 5);
      doc.setTextColor(...item.color);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(item.value, cx + 4, y + 10.5);
    });
    y += 16;
  };

  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setFillColor(...BLUE);
  doc.circle(pageW - 20, -10, 30, "F");

  doc.setTextColor(...WHITE);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Bludash", 14, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 220);
  doc.text("Social Media Analytics Report", 14, 21);

  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.text(`Client: ${client}`, pageW - 14, 14, { align: "right" });
  doc.text(`Period: ${from}  \u2192  ${to}`, pageW - 14, 21, { align: "right" });
  y = 38;

  sectionHeader("  FACEBOOK", BLUE);

  const fbOrganicLikes = fbPosts.reduce((s, p) => s + p.likes, 0);
  const fbOrganicComments = fbPosts.reduce((s, p) => s + p.comments, 0);
  const fbOrganicShares = fbPosts.reduce((s, p) => s + p.shares, 0);

  summaryCards([
    {
      label: "Likes",
      value: fbOrganicLikes.toLocaleString(),
      sub: `Organic: ${fbOrganicLikes.toLocaleString()}`,
    },
    {
      label: "Comments",
      value: fbOrganicComments.toLocaleString(),
      sub: `Organic: ${fbOrganicComments.toLocaleString()}`,
    },
    {
      label: "Shares",
      value: fbOrganicShares.toLocaleString(),
      sub: `Organic: ${fbOrganicShares.toLocaleString()}`,
    },
    {
      label: "Reach",
      value: fbReachBreakdown.total.toLocaleString(),
      sub: `Organic: ${fbReachBreakdown.organic.toLocaleString()}  |  Paid: ${fbReachBreakdown.paid.toLocaleString()}`,
    },
    { label: "Posts", value: fbPosts.length.toString() },
  ]);

  audienceBar(fbFollows.follows, fbFollows.unfollows, fbPageViews, "Page Views");

  if (y > 160) {
    doc.addPage();
    y = 14;
  }
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MUTED);
  doc.text("Facebook Posts", 10, y);
  y += 4;

  const fbTableBody =
    fbPosts.length === 0
      ? [["No Facebook posts in this period.", "", "", "", "", "", "", "", "", "", "", "", ""]]
      : fbPosts.map((p) => {
        const b = matchBoosted(p, boostedMap);
        return [
          new Date(p.createdTime).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          p.type,
          p.message.length > 55 ? p.message.substring(0, 55) + "\u2026" : p.message || "\u2014",
          p.likes.toLocaleString(),
          p.comments.toLocaleString(),
          p.shares.toLocaleString(),
          p.type === "REEL" ? p.views.toLocaleString() : "\u2014",
          (p.reach + (b?.reach || 0)).toLocaleString(),
          p.type === "REEL" ? peopleFromRate(p.views, p.skipRate).toLocaleString() : "\u2014",
          p.type === "REEL" ? peopleFromRate(p.views, p.holdRate).toLocaleString() : "\u2014",
          `${p.engagementRate}%`,
          b ? `Yes\n\u20B9${parseFloat(b.amountSpent).toLocaleString()}` : "\u2014",
          p.permalink,
        ];
      });

  autoTable(doc, {
    startY: y,
    head: [[
      "Date",
      "Type",
      "Caption",
      "Likes",
      "Comments",
      "Shares",
      "Views",
      "Reach",
      "Skip #",
      "Hold #",
      "Eng.%",
      "Boosted",
      "Post Link",
    ]],
    body: fbTableBody,
    theme: "grid",
    styles: {
      fontSize: 6.5,
      cellPadding: 2,
      overflow: "linebreak",
      halign: "left",
      textColor: DARK,
    },
    headStyles: {
      fillColor: BLUE,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [248, 249, 252] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 16 },
      2: { cellWidth: 60 },
      3: { cellWidth: 14, halign: "right" },
      4: { cellWidth: 16, halign: "right" },
      5: { cellWidth: 14, halign: "right" },
      6: { cellWidth: 16, halign: "right" },
      7: { cellWidth: 18, halign: "right" },
      8: { cellWidth: 14, halign: "right" },
      9: { cellWidth: 14, halign: "right" },
      10: { cellWidth: 14, halign: "right" },
      11: { cellWidth: 20 },
      12: { cellWidth: 39, textColor: [29, 78, 216] as [number, number, number] },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 12 && fbPosts.length > 0) {
        const rowIdx = data.row.index;
        if (rowIdx < fbPosts.length) {
          const link = fbPosts[rowIdx].permalink;
          if (link) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: link });
        }
      }
      if (data.section === "body" && data.column.index === 11 && fbPosts.length > 0) {
        const rowIdx = data.row.index;
        if (rowIdx < fbPosts.length && matchBoosted(fbPosts[rowIdx], boostedMap)) {
          doc.setFillColor(...AMBER_LIGHT);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, "F");
          doc.setTextColor(...AMBER);
          doc.setFontSize(6.5);
          doc.text(String(data.cell.raw), data.cell.x + 2, data.cell.y + 4);
        }
      }
    },
    margin: { left: 10, right: 10 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  if (y > 155) {
    doc.addPage();
    y = 14;
  }
  sectionHeader("  INSTAGRAM", PURPLE);

  const igOrganicLikes = igPosts.reduce((s, p) => s + p.likes, 0);
  const igOrganicComments = igPosts.reduce((s, p) => s + p.comments, 0);
  const igOrganicShares = igPosts.reduce((s, p) => s + p.shares, 0);
  const igOrganicSaves = igPosts.reduce((s, p) => s + p.saves, 0);
  const igPaidLikes = igPosts.reduce(
    (s, p) => s + (matchBoosted(p, boostedMap)?.paidLikes || 0),
    0
  );
  const igPaidComments = igPosts.reduce(
    (s, p) => s + (matchBoosted(p, boostedMap)?.paidComments || 0),
    0
  );
  const igPaidShares = igPosts.reduce(
    (s, p) => s + (matchBoosted(p, boostedMap)?.paidShares || 0),
    0
  );

  // Reel-specific aggregates for PDF summary
  const reelPosts = igPosts.filter((p) => p.type === "REEL");
  const totalReelViews = reelPosts.reduce((s, p) => s + p.views, 0);
  const reelsWithHold = reelPosts.filter((p) => p.holdRate != null);
  const avgHoldOverall =
    reelsWithHold.length > 0
      ? parseFloat(
        (
          reelsWithHold.reduce((s, p) => s + (p.holdRate ?? 0), 0) /
          reelsWithHold.length
        ).toFixed(1)
      )
      : null;
  const reelsWithWatch = reelPosts.filter((p) => p.avgWatchTime != null);
  const avgWatchOverall =
    reelsWithWatch.length > 0
      ? Math.round(
        reelsWithWatch.reduce((s, p) => s + (p.avgWatchTime ?? 0), 0) /
        reelsWithWatch.length
      )
      : null;
  const reelsWithSkip = reelPosts.filter((p) => p.skipRate != null);
  const totalSkippedPeople = reelPosts.reduce((s, p) => s + peopleFromRate(p.views, p.skipRate), 0);
  const totalHeldPeople = reelPosts.reduce((s, p) => s + peopleFromRate(p.views, p.holdRate), 0);
  const avgSkipOverall =
    reelsWithSkip.length > 0
      ? parseFloat(
        (
          reelsWithSkip.reduce((s, p) => s + (p.skipRate ?? 0), 0) /
          reelsWithSkip.length
        ).toFixed(1)
      )
      : null;

  summaryCards([
    {
      label: "Likes",
      value: (igOrganicLikes + igPaidLikes).toLocaleString(),
      sub: `Organic: ${igOrganicLikes.toLocaleString()}  |  Paid: ${igPaidLikes.toLocaleString()}`,
      color: PURPLE,
    },
    {
      label: "Comments",
      value: (igOrganicComments + igPaidComments).toLocaleString(),
      sub: `Organic: ${igOrganicComments.toLocaleString()}  |  Paid: ${igPaidComments.toLocaleString()}`,
      color: PURPLE,
    },
    {
      label: "Shares",
      value: (igOrganicShares + igPaidShares).toLocaleString(),
      sub: `Organic: ${igOrganicShares.toLocaleString()}  |  Paid: ${igPaidShares.toLocaleString()}`,
      color: PURPLE,
    },
    { label: "Saves", value: igOrganicSaves.toLocaleString(), color: PURPLE },
    {
      label: "Reach",
      value: igReachBreakdown.total.toLocaleString(),
      sub: `Organic: ${igReachBreakdown.organic.toLocaleString()}  |  Paid: ${igReachBreakdown.paid.toLocaleString()}`,
      color: PURPLE,
    },
    { label: "Posts", value: igPosts.length.toString() },
    ...(reelPosts.length > 0
      ? [{ label: "Reel Views", value: totalReelViews > 0 ? totalReelViews.toLocaleString() : "\u2014", sub: `Across ${reelPosts.length} reels`, color: PURPLE }]
      : []),
    ...(avgWatchOverall != null
      ? [{ label: "Avg Watch", value: `${avgWatchOverall}s`, sub: `Across ${reelsWithWatch.length} reels`, color: PURPLE }]
      : []),
    ...(avgSkipOverall != null
      ? [{ label: "Avg Skip Rate", value: `${avgSkipOverall}% (${totalSkippedPeople.toLocaleString()})`, sub: `Skipped people across ${reelsWithSkip.length} reels`, color: avgSkipOverall > 50 ? RED : avgSkipOverall > 25 ? AMBER : GREEN }]
      : []),
    ...(avgHoldOverall != null
      ? [{ label: "Avg Hold Rate", value: `${avgHoldOverall}% (${totalHeldPeople.toLocaleString()})`, sub: `Held people across ${reelsWithHold.length} reels`, color: avgHoldOverall >= 75 ? GREEN : avgHoldOverall >= 50 ? AMBER : RED }]
      : []),
  ]);

  audienceBar(igFollows.follows, igFollows.unfollows, igProfileViews, "Profile Views");

  if (y > 155) {
    doc.addPage();
    y = 14;
  }
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MUTED);
  doc.text("Instagram Posts", 10, y);
  y += 4;

  const igTableBody =
    igPosts.length === 0
      ? [["No Instagram posts in this period.", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]]
      : igPosts.map((p) => {
        const b = matchBoosted(p, boostedMap);
        const totalLikes = p.likes + (b?.paidLikes || 0);
        const totalComments = p.comments + (b?.paidComments || 0);
        const totalShares = p.shares + (b?.paidShares || 0);
        const totalReach = p.reach + (b?.reach || 0);
        return [
          new Date(p.createdTime).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          p.type,
          p.message.length > 50 ? p.message.substring(0, 50) + "\u2026" : p.message || "\u2014",
          totalLikes.toLocaleString(),
          totalComments.toLocaleString(),
          totalShares.toLocaleString(),
          p.saves.toLocaleString(),
          totalReach.toLocaleString(),
          p.type === "REEL" ? p.views.toLocaleString() : "\u2014",
          `${p.engagementRate}%`,
          p.type === "REEL" && p.avgWatchTime != null ? `${p.avgWatchTime}s` : "\u2014",
          p.type === "REEL" ? rateWithPeople(p.skipRate, p.views) : "\u2014",
          p.type === "REEL" ? rateWithPeople(p.holdRate, p.views) : "\u2014",
          b ? `Yes\n\u20B9${parseFloat(b.amountSpent).toLocaleString()}` : "\u2014",
          p.permalink,
        ];
      });

  autoTable(doc, {
    startY: y,
    head: [[
      "Date",
      "Type",
      "Caption",
      "Likes",
      "Comments",
      "Shares",
      "Saves",
      "Reach",
      "Views",
      "Eng.%",
      "Avg Watch",
      "Skip %",
      "Hold %",
      "Boosted",
      "Post Link",
    ]],
    body: igTableBody,
    theme: "grid",
    styles: {
      fontSize: 6.5,
      cellPadding: 2,
      overflow: "linebreak",
      halign: "left",
      textColor: DARK,
    },
    headStyles: {
      fillColor: PURPLE,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [248, 249, 252] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 12 },
      2: { cellWidth: 42 },
      3: { cellWidth: 10, halign: "right" },
      4: { cellWidth: 14, halign: "right" },
      5: { cellWidth: 10, halign: "right" },
      6: { cellWidth: 10, halign: "right" },
      7: { cellWidth: 14, halign: "right" },
      8: { cellWidth: 14, halign: "right" },
      9: { cellWidth: 10, halign: "right" },
      10: { cellWidth: 12, halign: "right" },
      11: { cellWidth: 16, halign: "right" },
      12: { cellWidth: 16, halign: "right" },
      13: { cellWidth: 16 },
      14: { cellWidth: 28, textColor: [124, 58, 237] as [number, number, number] },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 14 && igPosts.length > 0) {
        const rowIdx = data.row.index;
        if (rowIdx < igPosts.length) {
          const link = igPosts[rowIdx].permalink;
          if (link) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: link });
        }
      }
      if (data.section === "body" && data.column.index === 13 && igPosts.length > 0) {
        const rowIdx = data.row.index;
        if (rowIdx < igPosts.length && matchBoosted(igPosts[rowIdx], boostedMap)) {
          doc.setFillColor(...AMBER_LIGHT);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, "F");
          doc.setTextColor(...AMBER);
          doc.setFontSize(6.5);
          doc.text(String(data.cell.raw), data.cell.x + 2, data.cell.y + 4);
        }
      }
    },
    margin: { left: 10, right: 10 },
  });

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...DARK);
    doc.rect(0, doc.internal.pageSize.getHeight() - 8, pageW, 8, "F");
    doc.setTextColor(120, 120, 140);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Bludash  \u00B7  ${client}  \u00B7  ${from} \u2013 ${to}`,
      12,
      doc.internal.pageSize.getHeight() - 2.5
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageW - 12,
      doc.internal.pageSize.getHeight() - 2.5,
      { align: "right" }
    );
  }

  doc.save(`bludash_report_${client}_${from}_${to}.pdf`);
}

function MetricCard({
  label,
  value,
  organic,
  paid,
  dark,
  sub,
  currentValue,
  comparisonValue,
  tone = "blue",
}: {
  label: string;
  value: string;
  organic?: string | null;
  paid?: string | null;
  dark: boolean;
  sub?: string;
  currentValue?: number | null;
  comparisonValue?: number | null;
  tone?: "blue" | "violet" | "emerald" | "amber" | "rose";
}) {
  const hasComparison =
    typeof currentValue === "number" && typeof comparisonValue === "number";
  const trend = !hasComparison
    ? "neutral"
    : currentValue > comparisonValue
      ? "up"
      : currentValue < comparisonValue
        ? "down"
        : "neutral";

  const toneClasses = {
    blue: dark
      ? "border-blue-400/20 bg-[linear-gradient(145deg,rgba(18,26,52,0.98),rgba(10,14,28,0.95))] shadow-[0_16px_40px_rgba(37,99,235,0.18)]"
      : "border-blue-200 bg-[linear-gradient(145deg,#ffffff,#eff6ff)] shadow-[0_16px_40px_rgba(37,99,235,0.10)]",
    violet: dark
      ? "border-fuchsia-400/20 bg-[linear-gradient(145deg,rgba(43,20,58,0.98),rgba(18,10,32,0.95))] shadow-[0_16px_40px_rgba(217,70,239,0.18)]"
      : "border-fuchsia-200 bg-[linear-gradient(145deg,#ffffff,#fdf4ff)] shadow-[0_16px_40px_rgba(217,70,239,0.10)]",
    emerald: dark
      ? "border-emerald-400/20 bg-[linear-gradient(145deg,rgba(15,48,44,0.98),rgba(9,24,22,0.95))] shadow-[0_16px_40px_rgba(16,185,129,0.16)]"
      : "border-emerald-200 bg-[linear-gradient(145deg,#ffffff,#ecfdf5)] shadow-[0_16px_40px_rgba(16,185,129,0.10)]",
    amber: dark
      ? "border-amber-400/20 bg-[linear-gradient(145deg,rgba(57,35,12,0.98),rgba(26,18,8,0.95))] shadow-[0_16px_40px_rgba(245,158,11,0.16)]"
      : "border-amber-200 bg-[linear-gradient(145deg,#ffffff,#fffbeb)] shadow-[0_16px_40px_rgba(245,158,11,0.10)]",
    rose: dark
      ? "border-rose-400/20 bg-[linear-gradient(145deg,rgba(61,20,36,0.98),rgba(28,10,18,0.95))] shadow-[0_16px_40px_rgba(244,63,94,0.16)]"
      : "border-rose-200 bg-[linear-gradient(145deg,#ffffff,#fff1f2)] shadow-[0_16px_40px_rgba(244,63,94,0.10)]",
  } as const;

  const accentClasses = {
    blue: dark ? "text-blue-300" : "text-blue-700",
    violet: dark ? "text-fuchsia-300" : "text-fuchsia-700",
    emerald: dark ? "text-emerald-300" : "text-emerald-700",
    amber: dark ? "text-amber-300" : "text-amber-700",
    rose: dark ? "text-rose-300" : "text-rose-700",
  } as const;

  const splitSurface = dark ? "bg-white/[0.06]" : "bg-white/80";
  const wrapperClass =
    trend === "up"
      ? dark
        ? "border-emerald-300/40 bg-[linear-gradient(145deg,rgba(10,60,49,1),rgba(5,24,20,0.96))] shadow-[0_18px_48px_rgba(16,185,129,0.20)]"
        : "border-emerald-300 bg-[linear-gradient(145deg,#ffffff,#ecfdf5)] shadow-[0_18px_48px_rgba(16,185,129,0.14)]"
      : trend === "down"
        ? dark
          ? "border-rose-300/40 bg-[linear-gradient(145deg,rgba(66,20,34,1),rgba(25,9,15,0.96))] shadow-[0_18px_48px_rgba(244,63,94,0.20)]"
          : "border-rose-300 bg-[linear-gradient(145deg,#ffffff,#fff1f2)] shadow-[0_18px_48px_rgba(244,63,94,0.14)]"
        : toneClasses[tone];

const labelClass =
    trend === "neutral"
      ? dark ? "text-white/55" : "text-slate-500"
      : dark ? "text-white/80" : "text-slate-600";
  const valueClass =
    trend === "neutral"
      ? dark ? "text-white" : "text-slate-950"
      : dark ? "text-white" : "text-slate-900";
  const metaClass =
    trend === "neutral"
      ? dark ? "text-white/55" : "text-slate-600"
      : dark ? "text-white/80" : "text-slate-700";

  const pctChange =
    hasComparison && comparisonValue !== 0
      ? (((currentValue! - comparisonValue!) / comparisonValue!) * 100).toFixed(1)
      : null;

  const trendLabel =
    !hasComparison || comparisonValue === currentValue
      ? "No change"
      : comparisonValue === 0
        ? "New activity"
        : `${currentValue! > comparisonValue! ? "+" : ""}${pctChange}% vs prev`;

  return (
    <div className={`rounded-[24px] border p-5 transition-colors ${wrapperClass}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[11px] font-semibold tracking-[0.16em] uppercase ${labelClass}`}>
          {label}
        </p>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${trend === "up"
              ? dark
                ? "bg-white/12 text-emerald-100"
                : "bg-emerald-700/15 text-emerald-800"
              : trend === "down"
                ? dark
                  ? "bg-white/12 text-rose-100"
                  : "bg-rose-700/15 text-rose-800"
                : dark
                  ? "bg-white/[0.08] text-white/70"
                  : "bg-slate-100 text-slate-600"
            }`}
        >
          {trendLabel}
        </span>
      </div>

      <p className={`text-[30px] sm:text-[34px] font-bold leading-none mt-4 tracking-[-0.03em] ${valueClass}`}>
        {value}
      </p>

      {(organic || paid) && (
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className={`rounded-2xl px-3 py-2.5 border ${dark ? "border-white/[0.08]" : "border-black/[0.06]"} ${splitSurface}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${metaClass}`}>Organic</p>
            <p className={`text-[16px] sm:text-[18px] font-bold mt-1 ${accentClasses[tone]}`}>
              {organic || "0"}
            </p>
          </div>
          <div className={`rounded-2xl px-3 py-2.5 border ${dark ? "border-white/[0.08]" : "border-black/[0.06]"} ${splitSurface}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${metaClass}`}>Boosted</p>
            <p className={`text-[16px] sm:text-[18px] font-bold mt-1 ${paid ? accentClasses[tone] : dark ? "text-white/45" : "text-slate-400"}`}>
              {paid || "0"}
            </p>
          </div>
        </div>
      )}

      {sub && (
        <div className={`mt-4 rounded-xl px-3 py-2 border ${dark
            ? "border-white/[0.06] bg-white/[0.04]"
            : "border-slate-200/80 bg-slate-50/80"
          }`}>
          <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] mb-1 ${dark ? "text-white/30" : "text-slate-400"
            }`}>
            Previous period
          </p>
          <p className={`text-[11px] leading-relaxed font-medium ${dark ? "text-white/50" : "text-slate-500"
            }`}>{sub}</p>
        </div>
      )}
    </div>
  );
}

// ── Reel-specific stat card (no comparison arrow, just a clean display) ──
function ReelStatCard({
  label,
  value,
  hint,
  dark,
  tone = "violet",
}: {
  label: string;
  value: string;
  hint?: string;
  dark: boolean;
  tone?: "violet" | "amber" | "rose" | "emerald";
}) {
  const toneClasses = {
    violet: dark
      ? "border-fuchsia-400/20 bg-[linear-gradient(145deg,rgba(43,20,58,0.98),rgba(18,10,32,0.95))]"
      : "border-fuchsia-200 bg-[linear-gradient(145deg,#ffffff,#fdf4ff)]",
    amber: dark
      ? "border-amber-400/20 bg-[linear-gradient(145deg,rgba(57,35,12,0.98),rgba(26,18,8,0.95))]"
      : "border-amber-200 bg-[linear-gradient(145deg,#ffffff,#fffbeb)]",
    rose: dark
      ? "border-rose-400/20 bg-[linear-gradient(145deg,rgba(61,20,36,0.98),rgba(28,10,18,0.95))]"
      : "border-rose-200 bg-[linear-gradient(145deg,#ffffff,#fff1f2)]",
    emerald: dark
      ? "border-emerald-400/20 bg-[linear-gradient(145deg,rgba(15,48,44,0.98),rgba(9,24,22,0.95))]"
      : "border-emerald-200 bg-[linear-gradient(145deg,#ffffff,#ecfdf5)]",
  } as const;

  const accentClasses = {
    violet: dark ? "text-fuchsia-300" : "text-fuchsia-700",
    amber: dark ? "text-amber-300" : "text-amber-700",
    rose: dark ? "text-rose-300" : "text-rose-600",
    emerald: dark ? "text-emerald-300" : "text-emerald-700",
  } as const;

  return (
    <div className={`rounded-[24px] border p-5 ${toneClasses[tone]}`}>
      <p className={`text-[11px] font-semibold tracking-[0.16em] uppercase ${dark ? "text-white/55" : "text-slate-500"}`}>
        {label}
      </p>
      <p className={`text-[30px] sm:text-[34px] font-bold leading-none mt-4 tracking-[-0.03em] ${accentClasses[tone]}`}>
        {value}
      </p>
      {hint && (
        <p className={`text-[11px] mt-3 font-medium ${dark ? "text-white/35" : "text-slate-400"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

function SummarySection({
  title,
  icon,
  posts,
  dark,
  boostedMap,
  follows,
  isFB,
  profileViews,
  comparisonPosts,
  comparisonBoostedMap,
  comparisonFollows,
  comparisonProfileViews,
  comparisonRangeLabel,
  comparisonLoading,
  reachBreakdown,
  comparisonReachBreakdown,
}: {
  title: string;
  icon: ReactNode;
  posts: Post[];
  dark: boolean;
  boostedMap: Record<string, BoostedPost>;
  follows: { follows: number; unfollows: number };
  isFB: boolean;
  profileViews: number;
  comparisonPosts: Post[];
  comparisonBoostedMap: Record<string, BoostedPost>;
  comparisonFollows: { follows: number; unfollows: number };
  comparisonProfileViews: number;
  comparisonRangeLabel: string;
  comparisonLoading: boolean;
  reachBreakdown: ReachBreakdown;
  comparisonReachBreakdown: ReachBreakdown;
}) {
  const organicLikes = posts.reduce((s, p) => s + p.likes, 0);
  const organicComments = posts.reduce((s, p) => s + p.comments, 0);
  const organicShares = posts.reduce((s, p) => s + p.shares, 0);
  const organicReach = posts.reduce((s, p) => s + p.reach, 0);
  const paidLikes = isFB
    ? 0
    : posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidLikes || 0), 0);
  const paidComments = isFB
    ? 0
    : posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidComments || 0), 0);
  const paidShares = isFB
    ? 0
    : posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidShares || 0), 0);
  const paidReach = posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.reach || 0), 0);
  const net = follows.follows - follows.unfollows;
  const visits = profileViews;

  const comparisonOrganicLikes = comparisonPosts.reduce((s, p) => s + p.likes, 0);
  const comparisonOrganicComments = comparisonPosts.reduce((s, p) => s + p.comments, 0);
  const comparisonOrganicShares = comparisonPosts.reduce((s, p) => s + p.shares, 0);
  const comparisonOrganicReach = comparisonPosts.reduce((s, p) => s + p.reach, 0);
  const comparisonPaidLikes = isFB
    ? 0
    : comparisonPosts.reduce(
      (s, p) => s + (matchBoosted(p, comparisonBoostedMap)?.paidLikes || 0),
      0
    );
  const comparisonPaidComments = isFB
    ? 0
    : comparisonPosts.reduce(
      (s, p) => s + (matchBoosted(p, comparisonBoostedMap)?.paidComments || 0),
      0
    );
  const comparisonPaidShares = isFB
    ? 0
    : comparisonPosts.reduce(
      (s, p) => s + (matchBoosted(p, comparisonBoostedMap)?.paidShares || 0),
      0
    );
  const comparisonPaidReach = comparisonPosts.reduce(
    (s, p) => s + (matchBoosted(p, comparisonBoostedMap)?.reach || 0),
    0
  );
  const comparisonNet = comparisonFollows.follows - comparisonFollows.unfollows;
  const comparisonVisits = comparisonProfileViews;

  // ── Reel aggregates (IG only) ────────────────────────────────────
  const reelPosts = isFB ? [] : posts.filter((p) => p.type === "REEL");
  const totalReelViews = reelPosts.reduce((s, p) => s + p.views, 0);
  const reelsWithWatch = reelPosts.filter((p) => p.avgWatchTime != null);
  const avgWatchOverall =
    reelsWithWatch.length > 0
      ? Math.round(
        reelsWithWatch.reduce((s, p) => s + (p.avgWatchTime ?? 0), 0) /
        reelsWithWatch.length
      )
      : null;
  const reelsWithHold = reelPosts.filter((p) => p.holdRate != null);
  const avgHoldOverall =
    reelsWithHold.length > 0
      ? parseFloat(
        (
          reelsWithHold.reduce((s, p) => s + (p.holdRate ?? 0), 0) /
          reelsWithHold.length
        ).toFixed(1)
      )
      : null;
  const reelsWithSkip = reelPosts.filter((p) => p.skipRate != null);
  const totalSkippedPeople = reelPosts.reduce((s, p) => s + peopleFromRate(p.views, p.skipRate), 0);
  const totalHeldPeople = reelPosts.reduce((s, p) => s + peopleFromRate(p.views, p.holdRate), 0);
  const avgSkipOverall =
    reelsWithSkip.length > 0
      ? parseFloat(
        (
          reelsWithSkip.reduce((s, p) => s + (p.skipRate ?? 0), 0) /
          reelsWithSkip.length
        ).toFixed(1)
      )
      : null;

  const compSub = (val: number) =>
    comparisonLoading
      ? "Loading comparison..."
      : `${comparisonRangeLabel}: ${val.toLocaleString()}`;

  const summaryCards = [
    {
      label: "Likes",
      value: (organicLikes + paidLikes).toLocaleString(),
      organic: organicLikes.toLocaleString(),
      paid: paidLikes > 0 ? paidLikes.toLocaleString() : null,
      tone: isFB ? "blue" : "violet",
      currentValue: organicLikes + paidLikes,
      comparisonValue: comparisonOrganicLikes + comparisonPaidLikes,
      sub: compSub(comparisonOrganicLikes + comparisonPaidLikes),
    },
    {
      label: "Comments",
      value: (organicComments + paidComments).toLocaleString(),
      organic: organicComments.toLocaleString(),
      paid: paidComments > 0 ? paidComments.toLocaleString() : null,
      tone: "emerald",
      currentValue: organicComments + paidComments,
      comparisonValue: comparisonOrganicComments + comparisonPaidComments,
      sub: compSub(comparisonOrganicComments + comparisonPaidComments),
    },
    {
      label: "Shares",
      value: (organicShares + paidShares).toLocaleString(),
      organic: organicShares.toLocaleString(),
      paid: paidShares > 0 ? paidShares.toLocaleString() : null,
      tone: "amber",
      currentValue: organicShares + paidShares,
      comparisonValue: comparisonOrganicShares + comparisonPaidShares,
      sub: compSub(comparisonOrganicShares + comparisonPaidShares),
    },
    {
      label: "Reach",
      value: (organicReach + paidReach).toLocaleString(),
      organic: organicReach.toLocaleString(),
      paid: paidReach.toLocaleString(),
      tone: "rose",
      currentValue: organicReach + paidReach,
      comparisonValue: comparisonOrganicReach + comparisonPaidReach,
      sub: compSub(comparisonOrganicReach + comparisonPaidReach),
    },
    {
      label: isFB ? "Page Views" : "Profile Views",
      value: visits > 0 ? visits.toLocaleString() : "—",
      tone: isFB ? "blue" : "violet",
      currentValue: visits,
      comparisonValue: comparisonVisits,
      sub: compSub(comparisonVisits),
    },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 px-1">
        {icon}
        <h3
          className={`text-[13px] font-bold tracking-[0.18em] uppercase ${dark ? "text-white/70" : "text-slate-700"
            }`}
        >
          {title}
        </h3>
        <div className={`flex-1 h-px ${dark ? "bg-white/[0.06]" : "bg-black/[0.06]"}`} />
        <span
          className={`text-[11px] font-semibold rounded-full px-3 py-1 border ${dark
              ? "text-white/55 border-white/[0.08] bg-white/[0.04]"
              : "text-slate-500 border-slate-200 bg-white/80"
            }`}
        >
          {posts.length} post{posts.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {summaryCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            organic={"organic" in card ? card.organic : undefined}
            paid={"paid" in card ? card.paid : undefined}
            dark={dark}
            tone={card.tone}
            currentValue={card.currentValue}
            comparisonValue={card.comparisonValue}
            sub={card.sub}
          />
        ))}
      </div>

      {/* ── Reel performance summary (IG only, shown when reels exist) ── */}
      {!isFB && reelPosts.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 px-1">
            <div className={`w-1.5 h-1.5 rounded-full ${dark ? "bg-fuchsia-400" : "bg-fuchsia-500"}`} />
            <p className={`text-[11px] font-bold tracking-[0.16em] uppercase ${dark ? "text-white/45" : "text-slate-500"}`}>
              Reels Performance
            </p>
            <div className={`flex-1 h-px ${dark ? "bg-white/[0.04]" : "bg-black/[0.04]"}`} />
            <span className={`text-[11px] font-semibold rounded-full px-3 py-1 border ${dark
                ? "text-fuchsia-300/70 border-fuchsia-400/20 bg-fuchsia-500/[0.06]"
                : "text-fuchsia-600 border-fuchsia-200 bg-fuchsia-50"
              }`}>
              {reelPosts.length} reel{reelPosts.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className={`rounded-[28px] border p-5 ${dark
              ? "border-fuchsia-400/10 bg-[linear-gradient(145deg,rgba(43,18,58,0.70),rgba(18,8,32,0.85))]"
              : "border-fuchsia-100 bg-[linear-gradient(145deg,#fdf4ff,#ffffff)]"
            }`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">

              {/* Total reel reach */}
              <div className={`rounded-[20px] border px-4 py-4 ${dark ? "border-white/[0.08] bg-white/[0.03]" : "border-fuchsia-100 bg-white/90"}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/40" : "text-slate-500"}`}>
                  Reel Reach
                </p>
                <p className={`text-[26px] font-bold mt-2 tabular-nums ${dark ? "text-fuchsia-300" : "text-fuchsia-700"}`}>
                  {reelPosts.reduce((s, p) => s + p.reach, 0).toLocaleString()}
                </p>
                <p className={`text-[10px] mt-1 ${dark ? "text-white/30" : "text-slate-400"}`}>
                  across {reelPosts.length} reels
                </p>
              </div>

              {/* Total reel views */}
              <div className={`rounded-[20px] border px-4 py-4 ${dark ? "border-white/[0.08] bg-white/[0.03]" : "border-fuchsia-100 bg-white/90"}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/40" : "text-slate-500"}`}>
                  Reel Views
                </p>
                <p className={`text-[26px] font-bold mt-2 tabular-nums ${totalReelViews > 0
                    ? dark ? "text-fuchsia-300" : "text-fuchsia-700"
                    : dark ? "text-white/25" : "text-slate-300"
                  }`}>
                  {totalReelViews > 0 ? totalReelViews.toLocaleString() : "—"}
                </p>
                <p className={`text-[10px] mt-1 ${dark ? "text-white/30" : "text-slate-400"}`}>
                  total views across reels
                </p>
              </div>

              {/* Avg Engagement Rate across reels */}
              <div className={`rounded-[20px] border px-4 py-4 ${dark ? "border-white/[0.08] bg-white/[0.03]" : "border-fuchsia-100 bg-white/90"}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/40" : "text-slate-500"}`}>
                  Avg Eng. Rate
                </p>
                <p className={`text-[26px] font-bold mt-2 tabular-nums ${dark ? "text-fuchsia-300" : "text-fuchsia-700"}`}>
                  {reelPosts.length > 0
                    ? `${(reelPosts.reduce((s, p) => s + parseFloat(p.engagementRate), 0) / reelPosts.length).toFixed(2)}%`
                    : "—"}
                </p>
                <p className={`text-[10px] mt-1 ${dark ? "text-white/30" : "text-slate-400"}`}>
                  avg across all reels
                </p>
              </div>

              {/* Avg Watch Time */}
              <div className={`rounded-[20px] border px-4 py-4 ${dark ? "border-white/[0.08] bg-white/[0.03]" : "border-fuchsia-100 bg-white/90"}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/40" : "text-slate-500"}`}>
                  Avg Watch Time
                </p>
                <p className={`text-[26px] font-bold mt-2 tabular-nums ${avgWatchOverall != null
                    ? dark ? "text-fuchsia-300" : "text-fuchsia-700"
                    : dark ? "text-white/25" : "text-slate-300"
                  }`}>
                  {avgWatchOverall != null ? `${avgWatchOverall}s` : "—"}
                </p>
                <p className={`text-[10px] mt-1 ${dark ? "text-white/30" : "text-slate-400"}`}>
                  {reelsWithWatch.length > 0
                    ? `data from ${reelsWithWatch.length} reel${reelsWithWatch.length !== 1 ? "s" : ""}`
                    : "no data yet"}
                </p>
              </div>

              {/* Avg Skip Rate */}
              <div className={`rounded-[20px] border px-4 py-4 ${dark ? "border-white/[0.08] bg-white/[0.03]" : "border-fuchsia-100 bg-white/90"}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/40" : "text-slate-500"}`}>
                  Avg Skip Rate
                </p>
                <p className={`text-[26px] font-bold mt-2 tabular-nums ${avgSkipOverall == null
                    ? dark ? "text-white/25" : "text-slate-300"
                    : avgSkipOverall > 50
                      ? "text-rose-500"
                      : avgSkipOverall > 25
                        ? "text-amber-500"
                        : "text-emerald-500"
                  }`}>
                  {avgSkipOverall != null ? `${avgSkipOverall}% (${totalSkippedPeople.toLocaleString()})` : "—"}
                </p>
                <p className={`text-[10px] mt-1 ${dark ? "text-white/30" : "text-slate-400"}`}>
                  {avgSkipOverall == null
                    ? "no data yet"
                    : avgSkipOverall > 50
                      ? "high — hook needs work"
                      : avgSkipOverall > 25
                        ? "moderate skip rate"
                        : "low skip rate"}
                </p>
              </div>

              {/* Avg Hold Rate */}
              <div className={`rounded-[20px] border px-4 py-4 ${dark ? "border-white/[0.08] bg-white/[0.03]" : "border-fuchsia-100 bg-white/90"}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/40" : "text-slate-500"}`}>
                  Avg Hold Rate
                </p>
                <p className={`text-[26px] font-bold mt-2 tabular-nums ${avgHoldOverall == null
                    ? dark ? "text-white/25" : "text-slate-300"
                    : avgHoldOverall >= 75
                      ? "text-emerald-500"
                      : avgHoldOverall >= 50
                        ? "text-amber-500"
                        : "text-rose-500"
                  }`}>
                  {avgHoldOverall != null ? `${avgHoldOverall}% (${totalHeldPeople.toLocaleString()})` : "—"}
                </p>
                <p className={`text-[10px] mt-1 ${dark ? "text-white/30" : "text-slate-400"}`}>
                  {reelsWithHold.length > 0
                    ? `held people from ${reelsWithHold.length} reel${reelsWithHold.length !== 1 ? "s" : ""}`
                    : "no data yet"}
                </p>
              </div>

            </div>

            {/* Per-reel breakdown table */}
            {reelPosts.length > 0 && (
              <div className="mt-4">
                <div className={`rounded-xl border overflow-hidden ${dark ? "border-white/[0.06]" : "border-fuchsia-100"}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={dark ? "bg-fuchsia-900/30 border-b border-white/[0.06]" : "bg-fuchsia-50 border-b border-fuchsia-100"}>
                          {["Date", "Caption", "Reach", "Views", "Eng.%", "Avg Watch", "Skip Rate", "Hold Rate"].map((h) => (
                            <th
                              key={h}
                              className={`px-3 py-2.5 text-[10px] font-bold tracking-widest uppercase ${["Reach", "Views", "Eng.%", "Avg Watch", "Skip Rate", "Hold Rate"].includes(h) ? "text-right" : "text-left"
                                } ${dark ? "text-fuchsia-300/60" : "text-fuchsia-600/70"}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reelPosts.map((post, idx) => (
                          <tr
                            key={post.id}
                            className={`border-t ${dark
                                ? `border-white/[0.04] ${idx % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent"}`
                                : `border-fuchsia-50 ${idx % 2 === 0 ? "bg-white" : "bg-fuchsia-50/40"}`
                              }`}
                          >
                            <td className={`px-3 py-2.5 whitespace-nowrap text-[11px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>
                              {new Date(post.createdTime).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                              })}
                            </td>
                            <td className={`px-3 py-2.5 max-w-[180px] text-[11px] ${dark ? "text-white/60" : "text-slate-600"}`}>
                              <p className="truncate">{post.message || "—"}</p>
                            </td>
                            <td className={`px-3 py-2.5 text-right text-[12px] font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>
                              {post.reach.toLocaleString()}
                            </td>
                            <td className={`px-3 py-2.5 text-right text-[12px] font-semibold ${post.views > 0 ? dark ? "text-white/80" : "text-slate-800" : dark ? "text-white/20" : "text-slate-300"}`}>
                              {post.views > 0 ? post.views.toLocaleString() : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${parseFloat(post.engagementRate) >= 3
                                  ? dark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                                  : parseFloat(post.engagementRate) >= 1
                                    ? dark ? "bg-yellow-500/20 text-yellow-300" : "bg-yellow-100 text-yellow-700"
                                    : dark ? "bg-red-500/20 text-red-300" : "bg-red-100 text-red-700"
                                }`}>
                                {post.engagementRate}%
                              </span>
                            </td>
                            <td className={`px-3 py-2.5 text-right text-[12px] font-semibold ${dark ? "text-fuchsia-300" : "text-fuchsia-600"}`}>
                              {post.avgWatchTime != null ? `${post.avgWatchTime}s` : "—"}
                            </td>
                            <td className={`px-3 py-2.5 text-right text-[12px] font-semibold ${post.skipRate == null
                                ? dark ? "text-white/20" : "text-slate-300"
                                : post.skipRate > 50
                                  ? "text-rose-500"
                                  : post.skipRate > 25
                                    ? "text-amber-500"
                                    : "text-emerald-500"
                              }`}>
                              {rateWithPeople(post.skipRate, post.views)}
                            </td>
                            <td className={`px-3 py-2.5 text-right text-[12px] font-semibold ${post.holdRate == null
                                ? dark ? "text-white/20" : "text-slate-300"
                                : post.holdRate >= 75
                                  ? "text-emerald-500"
                                  : post.holdRate >= 50
                                    ? "text-amber-500"
                                    : "text-rose-500"
                              }`}>
                              {rateWithPeople(post.holdRate, post.views)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className={`rounded-[28px] border p-5 ${dark
            ? "border-white/[0.08] bg-[linear-gradient(145deg,rgba(20,24,42,0.98),rgba(10,13,24,0.98))] shadow-[0_20px_50px_rgba(15,23,42,0.35)]"
            : "border-slate-200 bg-[linear-gradient(145deg,#ffffff,#f8fafc)] shadow-[0_18px_48px_rgba(15,23,42,0.08)]"
          }`}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className={`text-[11px] font-semibold tracking-[0.16em] uppercase ${dark ? "text-white/45" : "text-slate-500"}`}>
              Audience Health
            </p>
            <p className={`text-[15px] sm:text-[16px] font-semibold mt-1 ${dark ? "text-white/90" : "text-slate-900"}`}>
              Follows, unfollows & profile visits
            </p>
          </div>
          <div className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full border font-medium ${dark
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
              : "border-amber-400/40 bg-amber-50 text-amber-700"
            }`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 3v18h18" /><path d="m7 16 4-4 4 4 4-4" />
            </svg>
            {comparisonLoading ? "Loading previous month..." : `vs ${comparisonRangeLabel}`}
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
          <div className={`rounded-[22px] border px-4 py-4 ${dark ? "border-white/[0.08] bg-white/[0.04]" : "border-slate-200 bg-white/90"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/45" : "text-slate-500"}`}>Follows</p>
            <p className={`text-[24px] sm:text-[28px] font-bold mt-2 tabular-nums ${dark ? "text-white" : "text-slate-950"}`}>
              {follows.follows.toLocaleString()}
            </p>
            {!comparisonLoading && (
              <p className={`text-[10px] mt-1.5 font-medium ${dark ? "text-white/30" : "text-slate-400"}`}>
                prev: {comparisonFollows.follows.toLocaleString()}
              </p>
            )}
          </div>

          <div className={`rounded-[22px] border px-4 py-4 ${dark ? "border-white/[0.08] bg-white/[0.04]" : "border-slate-200 bg-white/90"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/45" : "text-slate-500"}`}>Unfollows</p>
            <p className={`text-[24px] sm:text-[28px] font-bold mt-2 tabular-nums ${dark ? "text-white/75" : "text-slate-700"}`}>
              {follows.unfollows.toLocaleString()}
            </p>
            {!comparisonLoading && (
              <p className={`text-[10px] mt-1.5 font-medium ${dark ? "text-white/30" : "text-slate-400"}`}>
                prev: {comparisonFollows.unfollows.toLocaleString()}
              </p>
            )}
          </div>

          <div className={`rounded-[22px] border px-4 py-4 ${dark ? "border-white/[0.08] bg-white/[0.04]" : "border-slate-200 bg-white/90"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/45" : "text-slate-500"}`}>Net Growth</p>
            <p className={`text-[24px] sm:text-[28px] font-bold mt-2 tabular-nums ${net >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {net >= 0 ? "+" : ""}
              {net.toLocaleString()}
            </p>
            {!comparisonLoading && (
              <p className={`text-[10px] mt-1.5 font-medium ${dark ? "text-white/30" : "text-slate-400"}`}>
                prev: {comparisonNet >= 0 ? "+" : ""}{comparisonNet.toLocaleString()}
              </p>
            )}
          </div>

          <div className={`rounded-[22px] border px-4 py-4 ${dark ? "border-white/[0.08] bg-white/[0.04]" : "border-slate-200 bg-white/90"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/45" : "text-slate-500"}`}>
              {isFB ? "Page Views" : "Profile Views"}
            </p>
            <p className={`text-[24px] sm:text-[28px] font-bold mt-2 tabular-nums ${dark ? "text-white" : "text-slate-950"}`}>
              {profileViews > 0 ? profileViews.toLocaleString() : "—"}
            </p>
            {!comparisonLoading && (
              <p className={`text-[10px] mt-1.5 font-medium ${dark ? "text-white/30" : "text-slate-400"}`}>
                prev: {comparisonProfileViews > 0 ? comparisonProfileViews.toLocaleString() : "—"}
              </p>
            )}
          </div>
        </div>

        {!comparisonLoading && (
          <div className={`rounded-[20px] px-4 py-3 mt-4 border flex items-center gap-2 flex-wrap ${dark
              ? "border-amber-500/20 bg-amber-500/[0.06]"
              : "border-amber-200 bg-amber-50/60"
            }`}>
            <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${dark ? "text-amber-400/80" : "text-amber-600"}`}>
              Prev period
            </span>
            <span className={`text-[10px] ${dark ? "text-white/40" : "text-slate-400"}`}>&middot;</span>
            <p className={`text-[11px] leading-relaxed ${dark ? "text-white/55" : "text-slate-600"}`}>
              {comparisonRangeLabel}
              &nbsp;&nbsp;·&nbsp;&nbsp;Follows: <strong>{comparisonFollows.follows.toLocaleString()}</strong>
              &nbsp;&nbsp;·&nbsp;&nbsp;Unfollows: <strong>{comparisonFollows.unfollows.toLocaleString()}</strong>
              &nbsp;&nbsp;·&nbsp;&nbsp;Net: <strong className={comparisonNet >= 0 ? "text-emerald-500" : "text-rose-500"}>{comparisonNet >= 0 ? "+" : ""}{comparisonNet.toLocaleString()}</strong>
              &nbsp;&nbsp;·&nbsp;&nbsp;{isFB ? "Page Views" : "Profile Views"}: <strong>{comparisonProfileViews > 0 ? comparisonProfileViews.toLocaleString() : "—"}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PostTable({
  posts,
  showSaves,
  dark,
  boostedMap,
  onRowClick,
  isFB,
}: {
  posts: Post[];
  showSaves: boolean;
  dark: boolean;
  boostedMap: Record<string, BoostedPost>;
  onRowClick: (post: Post, boosted: BoostedPost | null) => void;
  isFB: boolean;
}) {
  if (posts.length === 0) {
    return (
      <p className={`text-sm text-center py-10 ${dark ? "text-white/25" : "text-slate-400"}`}>
        No posts found.
      </p>
    );
  }

  const showReelMetrics = showSaves || posts.some((post) => post.type === "REEL");
  const headers = [
    "Preview",
    "Type",
    "Boosted",
    "Date",
    "Caption",
    "Likes",
    "Comments",
    "Shares",
    ...(showSaves ? ["Saves"] : []),
    "Reach",
    ...(showReelMetrics ? ["Views"] : []),
    "Eng. Rate",
    ...(showReelMetrics ? ["Avg Watch", "Skip Rate", "Hold Rate"] : []),
  ];
  const rightAlign = new Set([
    "Likes",
    "Comments",
    "Shares",
    "Saves",
    "Reach",
    "Views",
    "Eng. Rate",
    "Avg Watch",
    "Skip Rate",
    "Hold Rate",
  ]);

  return (
    <div className={`rounded-xl border overflow-hidden ${dark ? "border-white/[0.08]" : "border-slate-200"}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={dark ? "bg-[#1a1a2e] border-b border-white/[0.08]" : "bg-slate-50 border-b border-slate-200"}>
              {headers.map((h) => (
                <th
                  key={h}
                  className={`px-4 py-3.5 text-[10px] font-bold tracking-widest uppercase ${rightAlign.has(h) ? "text-right" : "text-left"
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
              const totalLikes = post.likes + (isFB ? 0 : boosted?.paidLikes || 0);
              const totalComments = post.comments + (isFB ? 0 : boosted?.paidComments || 0);
              const totalShares = post.shares + (isFB ? 0 : boosted?.paidShares || 0);
              const totalReach = post.reach + (boosted?.reach || 0);
              const isEven = idx % 2 === 0;

              return (
                <tr
                  key={post.id}
                  onClick={() => onRowClick(post, boosted)}
                  className={`border-t transition-colors cursor-pointer ${dark
                      ? `border-white/[0.05] ${isEven ? "bg-white/[0.01]" : "bg-transparent"
                      } hover:bg-white/[0.04]`
                      : `border-slate-100 ${isEven ? "bg-white" : "bg-slate-50/60"} hover:bg-blue-50/50`
                    }`}
                >
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
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${dark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className={dark ? "text-white/25" : "text-slate-400"}
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full tracking-widest uppercase ${post.type === "REEL"
                          ? dark
                            ? "bg-purple-500/20 text-purple-300"
                            : "bg-purple-100 text-purple-700"
                          : post.type === "CAROUSEL"
                            ? dark
                              ? "bg-blue-500/20 text-blue-300"
                              : "bg-blue-100 text-blue-700"
                            : dark
                              ? "bg-white/[0.08] text-white/40"
                              : "bg-slate-200 text-slate-600"
                        }`}
                    >
                      {post.type}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {!boosted ? (
                      <span className={`text-[11px] ${dark ? "text-white/20" : "text-slate-300"}`}>—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${dark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-700"}`}>
                          BOOSTED
                        </span>
                        <span className={`text-[10px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>
                          ₹{parseFloat(boosted.amountSpent).toLocaleString()}
                        </span>
                        <span
                          className={`text-[10px] font-medium ${boosted.status === "ACTIVE"
                              ? dark
                                ? "text-emerald-400"
                                : "text-emerald-600"
                              : boosted.status === "PAUSED"
                                ? dark
                                  ? "text-yellow-400"
                                  : "text-yellow-600"
                                : dark
                                  ? "text-white/25"
                                  : "text-slate-400"
                            }`}
                        >
                          {boosted.status}
                        </span>
                      </div>
                    )}
                  </td>

                  <td className={`px-4 py-3 whitespace-nowrap text-[11px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>
                    {new Date(post.createdTime).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>

                  <td className={`px-4 py-3 max-w-[180px] text-[12px] ${dark ? "text-white/60" : "text-slate-700"}`}>
                    <p className="truncate">{post.message || "—"}</p>
                  </td>

                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>
                    {totalLikes.toLocaleString()}
                  </td>
                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>
                    {totalComments.toLocaleString()}
                  </td>
                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>
                    {totalShares.toLocaleString()}
                  </td>
                  {showSaves && (
                    <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>
                      {post.saves.toLocaleString()}
                    </td>
                  )}
                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>
                    {totalReach.toLocaleString()}
                  </td>
                  {showReelMetrics && (
                    <td className={`px-4 py-3 text-right text-[13px] font-semibold ${post.type === "REEL" && post.views > 0 ? dark ? "text-white/80" : "text-slate-800" : dark ? "text-white/20" : "text-slate-300"}`}>
                      {post.type === "REEL" && post.views > 0 ? post.views.toLocaleString() : "—"}
                    </td>
                  )}

                  <td className="px-4 py-3 text-right">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${parseFloat(post.engagementRate) >= 3
                          ? dark
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-emerald-100 text-emerald-700"
                          : parseFloat(post.engagementRate) >= 1
                            ? dark
                              ? "bg-yellow-500/20 text-yellow-300"
                              : "bg-yellow-100 text-yellow-700"
                            : dark
                              ? "bg-red-500/20 text-red-300"
                              : "bg-red-100 text-red-700"
                        }`}
                    >
                      {post.engagementRate}%
                    </span>
                  </td>

                  {showReelMetrics && (
                    <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-purple-300" : "text-purple-600"}`}>
                      {post.type === "REEL" && post.avgWatchTime != null ? `${post.avgWatchTime}s` : "—"}
                    </td>
                  )}

                  {showReelMetrics && (
                    <td className={`px-4 py-3 text-right text-[13px] font-semibold ${post.type === "REEL" && post.skipRate != null
                        ? post.skipRate > 50
                          ? "text-rose-500"
                          : post.skipRate > 25
                            ? "text-amber-500"
                            : "text-emerald-500"
                        : dark ? "text-white/20" : "text-slate-300"
                      }`}>
                      {post.type === "REEL" ? rateWithPeople(post.skipRate, post.views) : "—"}
                    </td>
                  )}
                  {showReelMetrics && (
                    <td className={`px-4 py-3 text-right text-[13px] font-semibold ${post.type === "REEL" && post.holdRate != null
                        ? post.holdRate >= 75
                          ? "text-emerald-500"
                          : post.holdRate >= 50
                            ? "text-amber-500"
                            : "text-rose-500"
                        : dark ? "text-white/20" : "text-slate-300"
                      }`}>
                      {post.type === "REEL" ? rateWithPeople(post.holdRate, post.views) : "—"}
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

type SocialManusStatus =
  | "idle"
  | "creating"
  | "running"
  | "waiting"
  | "done"
  | "building"
  | "error";

interface SocialManusState {
  status: SocialManusStatus;
  brief: string;
  reportData: any | null;
  error: string | null;
}

async function socialSafeFetch(url: string, options?: RequestInit) {
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

function useSocialManusReport() {
  const [state, setState] = useState<SocialManusState>({
    status: "idle",
    brief: "",
    reportData: null,
    error: null,
  });

  const generateReport = useCallback(
    async (payload: any) => {
      setState({
        status: "creating",
        brief: "Submitting to GPT-5.5 for deep social analysis...",
        reportData: null,
        error: null,
      });

      setState((s) => ({
        ...s,
        status: "running",
        brief: "GPT-5.5 is analyzing your social data...",
      }));

      const { ok, data } = await socialSafeFetch("/api/social-gpt-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });

      if (!ok || !data?.reportData) {
        setState((s) => ({
          ...s,
          status: "error",
          error: data?.error ?? "Failed to generate GPT social report",
        }));
        return;
      }

      setState({
        status: "done",
        brief: "Deep analysis complete - now building HTML report...",
        reportData: data.reportData ?? null,
        error: null,
      });
    },
    []
  );

  const setBuilding = useCallback((brief: string) => {
    setState((s) => ({ ...s, status: "building", brief }));
  }, []);

  const dismiss = useCallback(() => {
    setState({ status: "idle", brief: "", reportData: null, error: null });
  }, []);

  return { state, generateReport, setBuilding, dismiss };
}

function PublicInstagramReport({
  client,
  fromLabel,
  toLabel,
  profile,
  dark,
  onBack,
}: {
  client: string;
  fromLabel: string;
  toLabel: string;
  profile: PublicInstagramProfile;
  dark: boolean;
  onBack: () => void;
}) {
  const metricCards = [
    { label: "Posts", value: profile.summary.posts.toLocaleString() },
    { label: "Likes", value: profile.summary.likes.toLocaleString() },
    { label: "Comments", value: profile.summary.comments.toLocaleString() },
    { label: "Shares", value: "N/A" },
    { label: "Followers", value: profile.followers != null ? profile.followers.toLocaleString() : "N/A" },
    { label: "Total posts", value: profile.totalPosts != null ? profile.totalPosts.toLocaleString() : "N/A" },
    { label: "Reach", value: "N/A" },
    { label: "Saves", value: "N/A" },
  ];
  const coverage = profile.coverage;

  return (
    <div className="w-full max-w-[1120px] mx-auto flex flex-col gap-6 pb-16 px-3 sm:px-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onBack}
          className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition-all ${
            dark
              ? "border-white/10 text-white/40 hover:text-white/80 hover:border-white/20"
              : "border-black/10 text-black/40 hover:text-black/70"
          }`}
        >
          ← Back
        </button>

        <div className="flex items-center gap-2">
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-black/10"}`} />
          <span className={`text-[11px] tracking-widest uppercase font-medium ${dark ? "text-white/25" : "text-black/25"}`}>
            Public Instagram Report &middot; {fromLabel} &ndash; {toLabel}
          </span>
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-black/10"}`} />
        </div>

        {profile.profileUrl && (
          <a
            href={profile.profileUrl}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all ${
              dark
                ? "border-pink-500/30 text-pink-300 hover:bg-pink-500/10"
                : "border-pink-600/30 text-pink-700 hover:bg-pink-50"
            }`}
          >
            Open profile
          </a>
        )}
      </div>

      <section
        className={`rounded-[22px] border p-6 sm:p-7 ${
          dark
            ? "bg-white/[0.035] border-white/[0.08]"
            : "bg-white border-slate-200 shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex items-start gap-4">
            {profile.profilePic ? (
              <img
                src={profile.profilePic}
                alt=""
                className="w-12 h-12 rounded-2xl object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4">
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none" />
                </svg>
              </div>
            )}

            <div>
              <p className={`text-[11px] tracking-[0.18em] uppercase font-semibold ${dark ? "text-white/35" : "text-slate-500"}`}>
                {client}
              </p>
              <h2 className={`text-2xl sm:text-3xl font-semibold mt-1 ${dark ? "text-white" : "text-slate-950"}`}>
                {profile.fullName || (profile.username ? `@${profile.username}` : "Instagram profile")}
              </h2>
              {profile.fullName && profile.username && (
                <p className={`text-[13px] mt-1 ${dark ? "text-white/45" : "text-slate-500"}`}>
                  @{profile.username}
                </p>
              )}
              {profile.profileUrl && (
                <p className={`text-[13px] mt-2 break-all ${dark ? "text-white/45" : "text-slate-500"}`}>
                  {profile.profileUrl}
                </p>
              )}
              {profile.biography && (
                <p className={`text-[13px] mt-3 max-w-2xl leading-5 ${dark ? "text-white/55" : "text-slate-600"}`}>
                  {profile.biography}
                </p>
              )}
            </div>
          </div>

          <div className={`rounded-2xl border px-4 py-3 max-w-md ${
            dark ? "border-amber-400/20 bg-amber-400/[0.08]" : "border-amber-200 bg-amber-50"
          }`}>
            <p className={`text-[11px] tracking-[0.16em] uppercase font-semibold ${dark ? "text-amber-200/80" : "text-amber-800"}`}>
              Public data
            </p>
            <p className={`text-[13px] mt-1 leading-5 ${dark ? "text-white/55" : "text-slate-600"}`}>
              {profile.reason} Likes and comments are fetched from public post data. Shares, saves, reach, profile views, and paid data are not public.
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metricCards.map((metric) => (
          <div
            key={metric.label}
            className={`rounded-2xl border p-4 ${
              dark ? "bg-white/[0.025] border-white/[0.07]" : "bg-white border-slate-200"
            }`}
          >
            <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-white/35" : "text-slate-500"}`}>
              {metric.label}
            </p>
            <p className={`text-2xl font-semibold mt-2 ${dark ? "text-white/80" : "text-slate-900"}`}>
              {metric.value}
            </p>
          </div>
        ))}
      </section>

      {(profile.scrapeError || coverage?.limited) && (
        <div className={`rounded-2xl border px-4 py-3 ${
          dark ? "border-amber-400/20 bg-amber-400/[0.08] text-amber-100/80" : "border-amber-200 bg-amber-50 text-amber-900"
        }`}>
          <p className="text-[13px] leading-5">
            {profile.scrapeError ||
              coverage?.warning ||
              `Fetched ${coverage?.fetchedPosts ?? 0} public posts across ${coverage?.pagesFetched ?? 0} pages. Older posts may exist beyond this public fetch limit.`}
          </p>
        </div>
      )}

      <section
        className={`rounded-[22px] border overflow-hidden ${
          dark
            ? "bg-white/[0.025] border-white/[0.07]"
            : "bg-white border-slate-200 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
        }`}
      >
        <div className={`px-5 py-4 border-b ${dark ? "border-white/[0.06]" : "border-slate-200"}`}>
          <p className={`text-[11px] tracking-[0.18em] uppercase font-semibold ${dark ? "text-white/35" : "text-slate-500"}`}>
            Posts in selected range
          </p>
        </div>

        {profile.posts.length === 0 ? (
          <div className={`px-5 py-10 text-center text-[13px] ${dark ? "text-white/45" : "text-slate-500"}`}>
            No public posts were found in this date range.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {profile.posts.map((post) => {
              const dateLabel = post.createdTime
                ? new Date(post.createdTime).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "Unknown date";

              return (
                <article
                  key={post.id || post.shortcode}
                  className={`grid grid-cols-1 md:grid-cols-[112px_1fr] gap-4 px-5 py-5 ${dark ? "hover:bg-white/[0.025]" : "hover:bg-slate-50"}`}
                >
                  <div className={`w-full md:w-28 aspect-square rounded-2xl overflow-hidden ${dark ? "bg-white/[0.05]" : "bg-slate-100"}`}>
                    {post.thumbnail ? (
                      <img src={post.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] uppercase tracking-[0.14em] text-slate-400">
                        {post.type}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] px-2 py-1 rounded-full border ${dark ? "border-white/10 text-white/45" : "border-slate-200 text-slate-500"}`}>
                          {post.type}
                        </span>
                        {post.source === "manual" && (
                          <span className={`text-[11px] px-2 py-1 rounded-full border ${
                            dark ? "border-amber-400/25 text-amber-200/80" : "border-amber-200 text-amber-700"
                          }`}>
                            Manual
                          </span>
                        )}
                        <span className={`text-[12px] ${dark ? "text-white/45" : "text-slate-500"}`}>
                          {dateLabel}
                        </span>
                      </div>
                      {post.permalink && (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className={`text-[12px] font-medium ${dark ? "text-pink-300 hover:text-pink-200" : "text-pink-700 hover:text-pink-800"}`}
                        >
                          Open post
                        </a>
                      )}
                    </div>

                    <p className={`text-[13px] leading-5 line-clamp-3 ${dark ? "text-white/65" : "text-slate-700"}`}>
                      {post.caption || "No caption"}
                    </p>

                    <div className="grid grid-cols-3 gap-2 max-w-md">
                      {[
                        { label: "Likes", value: post.likes != null ? post.likes.toLocaleString() : "N/A" },
                        { label: "Comments", value: post.comments != null ? post.comments.toLocaleString() : "N/A" },
                        { label: "Shares", value: "N/A" },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className={`rounded-xl border px-3 py-2 ${dark ? "border-white/[0.07] bg-white/[0.025]" : "border-slate-200 bg-slate-50"}`}
                        >
                          <p className={`text-[10px] uppercase tracking-[0.14em] font-semibold ${dark ? "text-white/30" : "text-slate-500"}`}>
                            {item.label}
                          </p>
                          <p className={`text-[15px] font-semibold mt-1 ${dark ? "text-white/80" : "text-slate-900"}`}>
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default function SocialMediaReport({
  client,
  from,
  to,
  platform,
  dark,
  onBack,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  const [publicInstagram, setPublicInstagram] = useState<PublicInstagramProfile | null>(null);
  const [activeTab, setActiveTab] = useState<"FB" | "IG">(
    platform === "IG" ? "IG" : "FB"
  );
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("default");

  const { boostedMap } = useBoostedPosts(client, from, to);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedBoosted, setSelectedBoosted] = useState<BoostedPost | null>(null);
  const [cfgToken, setCfgToken] = useState("");
  const [fbFollows, setFbFollows] = useState({ follows: 0, unfollows: 0 });
  const [igFollows, setIgFollows] = useState({ follows: 0, unfollows: 0 });
  const [fbPageViews, setFbPageViews] = useState(0);
  const [igProfileViews, setIgProfileViews] = useState(0);

  const emptyReach: ReachBreakdown = { total: 0, organic: 0, paid: 0 };

  const [fbReachBreakdown, setFbReachBreakdown] = useState<ReachBreakdown>(emptyReach);
  const [igReachBreakdown, setIgReachBreakdown] = useState<ReachBreakdown>(emptyReach);
  const [comparisonFbReachBreakdown, setComparisonFbReachBreakdown] = useState<ReachBreakdown>(emptyReach);
  const [comparisonIgReachBreakdown, setComparisonIgReachBreakdown] = useState<ReachBreakdown>(emptyReach);

  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);

  const comparisonRange = getPreviousMonthComparisonRange(from, to);

  const { boostedMap: comparisonBoostedMap } = useBoostedPosts(
    client,
    comparisonRange.from,
    comparisonRange.to,
    Boolean(data)
  );

  const [comparisonData, setComparisonData] = useState<ReportData | null>(null);
  const [comparisonAudience, setComparisonAudience] = useState({
    fbFollows: { follows: 0, unfollows: 0 },
    igFollows: { follows: 0, unfollows: 0 },
    fbPageViews: 0,
    igProfileViews: 0,
  });
  const [comparisonLoading, setComparisonLoading] = useState(true);

  const {
    state: manusState,
    generateReport: generateManusReport,
    setBuilding,
    dismiss: dismissManus,
  } = useSocialManusReport();

  const isGeneratingManus =
    manusState.status === "creating" ||
    manusState.status === "running" ||
    manusState.status === "waiting";

  useEffect(() => {
    if (manusState.status === "done" && manusState.reportData && data) {
      const payload = buildSocialReportPayload(
        data.fbPosts,
        data.igPosts,
        boostedMap as any,
        fbFollows,
        igFollows,
        fbPageViews,
        igProfileViews,
        client,
        from,
        to,
        platform,
        fbReachBreakdown,
  igReachBreakdown,
  {
    from: comparisonRange.from,
    to: comparisonRange.to,
    fbPosts: comparisonData?.fbPosts ?? [],
    igPosts: comparisonData?.igPosts ?? [],
    fbFollows: comparisonAudience.fbFollows,
    igFollows: comparisonAudience.igFollows,
    fbPageViews: comparisonAudience.fbPageViews,
    igProfileViews: comparisonAudience.igProfileViews,
    fbReachBreakdown: comparisonFbReachBreakdown,
    igReachBreakdown: comparisonIgReachBreakdown,
  }
        
      );
        setBuilding("GPT-5.5 is now building your HTML social report...");
      generateSocialReportPDF(
        payload,
        manusState.reportData,
        client,
        from,
        to,
        (brief) => setBuilding(brief)
      )
        .then(() => dismissManus())
        .catch((err) => {
          console.error("Social HTML report failed:", err);
        });
    }
  }, [
    manusState.status,
    manusState.reportData,
    data,
    boostedMap,
    fbFollows,
    igFollows,
    fbPageViews,
    igProfileViews,
    client,
    from,
    to,
    platform,
    setBuilding,
    dismissManus,
  ]);

  useEffect(() => {
    let cancelled = false;
    const comparisonTimer = window.setTimeout(() => {
      if (!cancelled) void fetchComparisonReport();
    }, 800);

    void fetchReport();

    return () => {
      cancelled = true;
      window.clearTimeout(comparisonTimer);
    };
  }, [client, from, to, platform]);

  useEffect(() => {
    if (!data) return;

    const fbOrganicReach = data.fbPosts.reduce((sum, post) => sum + post.reach, 0);
    const fbPaidReach = data.fbPosts.reduce(
      (sum, post) => sum + (matchBoosted(post, boostedMap)?.reach || 0),
      0
    );
    const igOrganicReach = data.igPosts.reduce((sum, post) => sum + post.reach, 0);
    const igPaidReach = data.igPosts.reduce(
      (sum, post) => sum + (matchBoosted(post, boostedMap)?.reach || 0),
      0
    );

    setFbReachBreakdown({
      total: fbOrganicReach + fbPaidReach,
      organic: fbOrganicReach,
      paid: fbPaidReach,
    });
    setIgReachBreakdown({
      total: igOrganicReach + igPaidReach,
      organic: igOrganicReach,
      paid: igPaidReach,
    });
  }, [data, boostedMap]);

  // ── helper: fetch reel-specific metrics for a single post ────────
  const fetchReelMetrics = async (
    postId: string,
    token: string
  ): Promise<{
    views: number;
    avgWatchTime: number | null;
    skipRate: number | null;
    holdRate: number | null;
  }> => {
    const empty = {
      views: 0,
      avgWatchTime: null,
      skipRate: null,
      holdRate: null,
    };

    const parseMetrics = (data: any[]) => {
      const watchVal = igVal(data, "ig_reels_avg_watch_time");
      const avgWatchTime = watchVal ? Math.round(watchVal / 1000) : null;

      // Meta returns skip rate as a decimal fraction (0.42 = 42%)
      const skipRaw = igVal(data, "reels_skip_rate");
      const skipRate =
        skipRaw != null && skipRaw > 0
          ? skipRaw <= 1
            ? parseFloat((skipRaw * 100).toFixed(1))
            : parseFloat(skipRaw.toFixed(1))
          : null;

      const views = Math.max(
        igVal(data, "views"),
        igVal(data, "plays"),
        igVal(data, "video_views"),
        igVal(data, "ig_reels_aggregated_all_plays_count")
      );

      const holdRate =
        skipRate != null
          ? parseFloat(Math.max(0, 100 - skipRate).toFixed(1))
          : null;

      return {
        views,
        avgWatchTime,
        skipRate,
        holdRate,
      };
    };

    try {
      const wRes = await fetchWithTimeout(
        `${BASE}/${postId}/insights?metric=ig_reels_avg_watch_time,reels_skip_rate,views&period=lifetime&access_token=${token}`
      );
      const wData = await wRes.json();
      if (wData?.error) throw new Error(wData.error.message || "Reel metric request failed");

      return parseMetrics(wData?.data || []);
    } catch {
      try {
        const [watchRes, viewsRes] = await Promise.all([
          fetchWithTimeout(
            `${BASE}/${postId}/insights?metric=ig_reels_avg_watch_time,reels_skip_rate&period=lifetime&access_token=${token}`
          ),
          fetchWithTimeout(
            `${BASE}/${postId}/insights?metric=views&period=lifetime&access_token=${token}`
          ),
        ]);
        const [watchData, viewsData] = await Promise.all([watchRes.json(), viewsRes.json()]);
        return parseMetrics([...(watchData?.data || []), ...(viewsData?.data || [])]);
      } catch {
        return empty;
      }
    }
  };

  const fetchComparisonReport = async () => {
    setComparisonLoading(true);

    try {
      const cfg = await getSocialMediaConfig(client);
      const publicFallback = publicInstagramFallback(cfg, platform, client);
      if (publicFallback) {
        setComparisonAudience({
          fbFollows: { follows: 0, unfollows: 0 },
          igFollows: { follows: 0, unfollows: 0 },
          fbPageViews: 0,
          igProfileViews: 0,
        });
        setComparisonData({ fbPosts: [], igPosts: [] });
        return;
      }

      const cfgError = socialConfigError(cfg, platform, client);
      if (cfgError) {
        setComparisonAudience({
          fbFollows: { follows: 0, unfollows: 0 },
          igFollows: { follows: 0, unfollows: 0 },
          fbPageViews: 0,
          igProfileViews: 0,
        });
        setComparisonData({ fbPosts: [], igPosts: [] });
        return;
      }

      let fbPosts: Post[] = [];
      let igPosts: Post[] = [];
      const fbAudienceId = facebookAudienceTarget(platform, cfg);
      const igAudienceId = instagramAudienceTarget(platform, cfg);

      const [fbFollowsJson, fbViewsJson, igFollowsJson, igProfileViewsJson] =
        await Promise.all([
          fetchAudienceJson(
            fbAudienceId
              ? `${BASE}/${fbAudienceId}/insights?metric=page_daily_follows_unique,page_daily_unfollows_unique&period=day&since=${comparisonRange.from}&until=${comparisonRange.to}&access_token=${cfg.token}`
              : null
          ),
          fetchAudienceJson(
            fbAudienceId
              ? `${BASE}/${fbAudienceId}/insights?metric=page_views_total&period=day&since=${comparisonRange.from}&until=${comparisonRange.to}&access_token=${cfg.token}`
              : null
          ),
          fetchAudienceJson(
            igAudienceId
              ? `${BASE}/${igAudienceId}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=${comparisonRange.from}&until=${comparisonRange.to}&access_token=${cfg.token}`
              : null
          ),
          fetchAudienceJson(
            igAudienceId
              ? `${BASE}/${igAudienceId}/insights?metric=profile_views&metric_type=total_value&period=day&since=${comparisonRange.from}&until=${comparisonRange.to}&access_token=${cfg.token}`
              : null
          ),
        ]);

      const fbFw = fbFollowsJson?.data?.find(
        (m) => m.name === "page_daily_follows_unique"
      );
      const fbUf = fbFollowsJson?.data?.find(
        (m) => m.name === "page_daily_unfollows_unique"
      );
      const fbPageViewsMetric = fbViewsJson?.data?.find(
        (m) => m.name === "page_views_total"
      );
      const igFollowStats = parseInstagramFollowStats(igFollowsJson);

      setComparisonAudience({
        fbFollows: {
          follows: sumMetricValues(fbFw),
          unfollows: sumMetricValues(fbUf),
        },
        igFollows: {
          follows: igFollowStats.follows,
          unfollows: igFollowStats.unfollows,
        },
        fbPageViews: sumMetricValues(fbPageViewsMetric),
        igProfileViews: parseInstagramProfileViews(igProfileViewsJson),
      });

      if (platform === "FB" || platform === "BOTH") {
        const fbRes = await fetchWithTimeout(
          `${BASE}/${cfg.fbPageId}/posts?fields=id,message,created_time,permalink_url,full_picture,reactions.summary(total_count),comments.summary(total_count),shares,attachments{media_type,media{source}}&since=${comparisonRange.from}&until=${comparisonRange.to}&limit=100&access_token=${cfg.token}`
        );
        const fbData = await fbRes.json();
        const rawFB = fbData.data || [];

        fbPosts = await Promise.all(
          rawFB.map(async (post: any) => {
            const isReel =
              post.permalink_url?.includes("/reel/") ||
              post.permalink_url?.includes("/videos/");
            const mediaUrl = post.attachments?.data?.[0]?.media?.source || null;
            const likes = post.reactions?.summary?.total_count ?? 0;
            const comments = post.comments?.summary?.total_count ?? 0;
            const shares = post.shares?.count ?? 0;

            try {
              const insRes = await fetchWithTimeout(
                `${BASE}/${post.id}/insights?metric=post_impressions_unique&access_token=${cfg.token}`
              );
              const ins = await insRes.json();
              const reach =
                ins?.data?.find((m: any) => m.name === "post_impressions_unique")
                  ?.values?.[0]?.value ?? 0;
              let views = 0;
              if (isReel) {
                try {
                  const viewRes = await fetchWithTimeout(
                    `${BASE}/${post.id}/insights?metric=post_video_views&access_token=${cfg.token}`
                  );
                  const viewData = await viewRes.json();
                  views =
                    viewData?.data?.find((m: any) => m.name === "post_video_views")
                      ?.values?.[0]?.value ?? 0;
                } catch {}
              }

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
                views,
                holdRate: null,
                engagementRate:
                  reach > 0
                    ? (((likes + comments + shares) / reach) * 100).toFixed(2)
                    : "0.00",
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
                views: 0,
                holdRate: null,
                engagementRate: "0.00",
              };
            }
          })
        );
      }

      if (platform === "IG" || platform === "BOTH") {
        const igRes = await fetchWithTimeout(
          `${BASE}/${cfg.igUserId}/media?fields=id,caption,media_type,timestamp,permalink,media_url,thumbnail_url&since=${comparisonRange.from}&until=${comparisonRange.to}&limit=100&access_token=${cfg.token}`
        );
        const igData = await igRes.json();
        const rawIG = igData.data || [];

        igPosts = await Promise.all(
          rawIG.map(async (post: any) => {
            try {
              const insRes = await fetchWithTimeout(
                `${BASE}/${post.id}/insights?metric=reach,likes,comments,shares,saved&period=lifetime&access_token=${cfg.token}`
              );
              const ins = await insRes.json();
              const reach = igVal(ins?.data, "reach");
              const likes = igVal(ins?.data, "likes");
              const comments = igVal(ins?.data, "comments");
              const shares = igVal(ins?.data, "shares");
              const saves = igVal(ins?.data, "saved");
              const mediaType =
                post.media_type === "VIDEO"
                  ? "REEL"
                  : post.media_type === "CAROUSEL_ALBUM"
                    ? "CAROUSEL"
                    : "IMAGE";
              const mediaUrl: string | null =
                mediaType === "REEL" || mediaType === "IMAGE"
                  ? post.media_url || null
                  : null;
              const thumbnail: string | null =
                post.thumbnail_url ||
                (mediaType !== "REEL" ? post.media_url : null) ||
                null;

              let avgWatchTime: number | null = null;
              let skipRate: number | null = null;
              let views = 0;
              let holdRate: number | null = null;
              if (mediaType === "REEL") {
                const reelMeta = await fetchReelMetrics(post.id, cfg.token);
                views = reelMeta.views;
                avgWatchTime = reelMeta.avgWatchTime;
                skipRate = reelMeta.skipRate;
                holdRate = reelMeta.holdRate;
              }

              return {
                id: post.id,
                message: post.caption || "",
                createdTime: post.timestamp,
                permalink: post.permalink,
                thumbnail,
                mediaUrl,
                type: mediaType,
                reach,
                likes,
                comments,
                shares,
                saves,
                views,
                engagementRate:
                  reach > 0
                    ? (((likes + comments + shares + saves) / reach) * 100).toFixed(2)
                    : "0.00",
                avgWatchTime,
                skipRate,
                holdRate,
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
                reach: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                saves: 0,
                views: 0,
                engagementRate: "0.00",
                avgWatchTime: null,
                skipRate: null,
                holdRate: null,
              };
            }
          })
        );
      }

      // ── OLD BEHAVIOR: reach = sum of per-post organic + matched paid ──
      const comparisonFbOrganicReach = fbPosts.reduce((s, p) => s + p.reach, 0);
      const comparisonFbPaidReach = fbPosts.reduce(
        (s, p) => s + (matchBoosted(p, comparisonBoostedMap)?.reach || 0),
        0
      );
      const comparisonIgOrganicReach = igPosts.reduce((s, p) => s + p.reach, 0);
      const comparisonIgPaidReach = igPosts.reduce(
        (s, p) => s + (matchBoosted(p, comparisonBoostedMap)?.reach || 0),
        0
      );

      setComparisonFbReachBreakdown({
        total: comparisonFbOrganicReach + comparisonFbPaidReach,
        organic: comparisonFbOrganicReach,
        paid: comparisonFbPaidReach,
      });

      setComparisonIgReachBreakdown({
        total: comparisonIgOrganicReach + comparisonIgPaidReach,
        organic: comparisonIgOrganicReach,
        paid: comparisonIgPaidReach,
      });

      setComparisonData({ fbPosts, igPosts });
    } catch {
      setComparisonData({ fbPosts: [], igPosts: [] });
    } finally {
      setComparisonLoading(false);
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    setData(null);
    setError("");
    setPublicInstagram(null);
    setStep(0);
    setProgress(0);

    let cfg: SocialMediaConfig;

    try {
      cfg = await getSocialMediaConfig(client);
      setCfgToken(cfg.token || "");

      const publicFallback = publicInstagramFallback(cfg, platform, client);
      if (publicFallback) {
        const publicReport = await fetchPublicInstagramReport(
          client,
          from,
          to,
          publicFallback
        );
        setPublicInstagram(publicReport);
        setData({ fbPosts: [], igPosts: [] });
        setFbFollows({ follows: 0, unfollows: 0 });
        setIgFollows({ follows: 0, unfollows: 0 });
        setFbPageViews(0);
        setIgProfileViews(0);
        setFbReachBreakdown(emptyReach);
        setIgReachBreakdown(emptyReach);
        setActiveTab("IG");
        setProgress(100);
        setLoading(false);
        return;
      }

      const cfgError = socialConfigError(cfg, platform, client);
      if (cfgError) {
        setError(cfgError);
        setLoading(false);
        return;
      }

      setFbReachBreakdown(emptyReach);
      setIgReachBreakdown(emptyReach);

      const fbAudienceId = facebookAudienceTarget(platform, cfg);
      const igAudienceId = instagramAudienceTarget(platform, cfg);

      if (fbAudienceId) {
        fetchAudienceJson(
          `${BASE}/${fbAudienceId}/insights?metric=page_daily_follows_unique,page_daily_unfollows_unique&period=day&since=${from}&until=${to}&access_token=${cfg.token}`
        ).then((d) => {
          const fw = d?.data?.find((m) => m.name === "page_daily_follows_unique");
          const uf = d?.data?.find((m) => m.name === "page_daily_unfollows_unique");
          setFbFollows({
            follows: sumMetricValues(fw),
            unfollows: sumMetricValues(uf),
          });
        });

        fetchAudienceJson(
          `${BASE}/${fbAudienceId}/insights?metric=page_views_total&period=day&since=${from}&until=${to}&access_token=${cfg.token}`
        ).then((d) => {
          const metric = d?.data?.find((m) => m.name === "page_views_total");
          setFbPageViews(sumMetricValues(metric));
        });
      } else {
        setFbFollows({ follows: 0, unfollows: 0 });
        setFbPageViews(0);
      }

      if (igAudienceId) {
        fetchAudienceJson(
          `${BASE}/${igAudienceId}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=${from}&until=${to}&access_token=${cfg.token}`
        ).then((d) => {
          const igFollowStats = parseInstagramFollowStats(d);
          setIgFollows({
            follows: igFollowStats.follows,
            unfollows: igFollowStats.unfollows,
          });
        });

        fetchAudienceJson(
          `${BASE}/${igAudienceId}/insights?metric=profile_views&metric_type=total_value&period=day&since=${from}&until=${to}&access_token=${cfg.token}`
        ).then((d) => {
          setIgProfileViews(parseInstagramProfileViews(d));
        });
      } else {
        setIgFollows({ follows: 0, unfollows: 0 });
        setIgProfileViews(0);
      }
    } catch {
      setError("Failed to load client config");
      setLoading(false);
      return;
    }

    try {
      let fbPosts: Post[] = [];
      let igPosts: Post[] = [];
      setStep(0);
      setProgress(10);

      if (platform === "FB" || platform === "BOTH") {
        setStep(1);
        setProgress(20);
        const fbRes = await fetchWithTimeout(
          `${BASE}/${cfg.fbPageId}/posts?fields=id,message,created_time,permalink_url,full_picture,reactions.summary(total_count),comments.summary(total_count),shares,attachments{media_type,media{source}}&since=${from}&until=${to}&limit=100&access_token=${cfg.token}`
        );
        const fbData = await fbRes.json();
        const rawFB = fbData.data || [];
        setStep(3);
        setProgress(45);

        fbPosts = await Promise.all(
          rawFB.map(async (post: any) => {
            const isReel =
              post.permalink_url?.includes("/reel/") ||
              post.permalink_url?.includes("/videos/");
            const mediaUrl = post.attachments?.data?.[0]?.media?.source || null;
            const likes = post.reactions?.summary?.total_count ?? 0;
            const comments = post.comments?.summary?.total_count ?? 0;
            const shares = post.shares?.count ?? 0;

            try {
              const insRes = await fetchWithTimeout(
                `${BASE}/${post.id}/insights?metric=post_impressions_unique&access_token=${cfg.token}`
              );
              const ins = await insRes.json();
              const reach =
                ins?.data?.find((m: any) => m.name === "post_impressions_unique")
                  ?.values?.[0]?.value ?? 0;
              let views = 0;
              if (isReel) {
                try {
                  const viewRes = await fetchWithTimeout(
                    `${BASE}/${post.id}/insights?metric=post_video_views&access_token=${cfg.token}`
                  );
                  const viewData = await viewRes.json();
                  views =
                    viewData?.data?.find((m: any) => m.name === "post_video_views")
                      ?.values?.[0]?.value ?? 0;
                } catch {}
              }
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
                views,
                holdRate: null,
                engagementRate:
                  reach > 0
                    ? (((likes + comments + shares) / reach) * 100).toFixed(2)
                    : "0.00",
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
                views: 0,
                holdRate: null,
                engagementRate: "0.00",
              };
            }
          })
        );
      }

      if (platform === "IG" || platform === "BOTH") {
        setStep(2);
        setProgress(65);
        const igRes = await fetchWithTimeout(
          `${BASE}/${cfg.igUserId}/media?fields=id,caption,media_type,timestamp,permalink,media_url,thumbnail_url&since=${from}&until=${to}&limit=100&access_token=${cfg.token}`
        );
        const igData = await igRes.json();
        const rawIG = igData.data || [];
        setStep(4);
        setProgress(80);

        igPosts = await Promise.all(
          rawIG.map(async (post: any) => {
            try {
              const insRes = await fetchWithTimeout(
                `${BASE}/${post.id}/insights?metric=reach,likes,comments,shares,saved&period=lifetime&access_token=${cfg.token}`
              );
              const ins = await insRes.json();
              const reach = igVal(ins?.data, "reach");
              const likes = igVal(ins?.data, "likes");
              const comments = igVal(ins?.data, "comments");
              const shares = igVal(ins?.data, "shares");
              const saves = igVal(ins?.data, "saved");
              const mediaType =
                post.media_type === "VIDEO"
                  ? "REEL"
                  : post.media_type === "CAROUSEL_ALBUM"
                    ? "CAROUSEL"
                    : "IMAGE";
              const mediaUrl: string | null =
                mediaType === "REEL" || mediaType === "IMAGE"
                  ? post.media_url || null
                  : null;
              const thumbnail: string | null =
                post.thumbnail_url ||
                (mediaType !== "REEL" ? post.media_url : null) ||
                null;

              let avgWatchTime: number | null = null;
              let skipRate: number | null = null;
              let views = 0;
              let holdRate: number | null = null;
              if (mediaType === "REEL") {
                const reelMeta = await fetchReelMetrics(post.id, cfg.token);
                views = reelMeta.views;
                avgWatchTime = reelMeta.avgWatchTime;
                skipRate = reelMeta.skipRate;
                holdRate = reelMeta.holdRate;
              }

              return {
                id: post.id,
                message: post.caption || "",
                createdTime: post.timestamp,
                permalink: post.permalink,
                thumbnail,
                mediaUrl,
                type: mediaType,
                reach,
                likes,
                comments,
                shares,
                saves,
                views,
                engagementRate:
                  reach > 0
                    ? (((likes + comments + shares + saves) / reach) * 100).toFixed(2)
                    : "0.00",
                avgWatchTime,
                skipRate,
                holdRate,
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
                reach: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                saves: 0,
                views: 0,
                engagementRate: "0.00",
                avgWatchTime: null,
                skipRate: null,
                holdRate: null,
              };
            }
          })
        );
      }

      // ── OLD BEHAVIOR: reach = sum of per-post organic + matched paid ──
      const fbOrganicReach = fbPosts.reduce((s, p) => s + p.reach, 0);
      const fbPaidReach = fbPosts.reduce(
        (s, p) => s + (matchBoosted(p, boostedMap)?.reach || 0),
        0
      );
      const igOrganicReach = igPosts.reduce((s, p) => s + p.reach, 0);
      const igPaidReach = igPosts.reduce(
        (s, p) => s + (matchBoosted(p, boostedMap)?.reach || 0),
        0
      );

      setFbReachBreakdown({
        total: fbOrganicReach + fbPaidReach,
        organic: fbOrganicReach,
        paid: fbPaidReach,
      });

      setIgReachBreakdown({
        total: igOrganicReach + igPaidReach,
        organic: igOrganicReach,
        paid: igPaidReach,
      });

      setStep(5);
      setProgress(100);
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
    if (key === "likes") return post.likes + (isFB ? 0 : b?.paidLikes || 0);
    if (key === "comments") return post.comments + (isFB ? 0 : b?.paidComments || 0);
    if (key === "shares") return post.shares + (isFB ? 0 : b?.paidShares || 0);
    if (key === "reach") return post.reach + (b?.reach || 0);
    return 0;
  };

  const getFilteredSorted = (posts: Post[]) => {
    let result = posts.filter((p) =>
      p.message.toLowerCase().includes(search.toLowerCase())
    );
    if (sortKey === "likes") {
      result = [...result].sort((a, b) => getTotal(b, "likes") - getTotal(a, "likes"));
    } else if (sortKey === "comments") {
      result = [...result].sort(
        (a, b) => getTotal(b, "comments") - getTotal(a, "comments")
      );
    } else if (sortKey === "shares") {
      result = [...result].sort((a, b) => getTotal(b, "shares") - getTotal(a, "shares"));
    } else if (sortKey === "saves") {
      result = [...result].sort((a, b) => b.saves - a.saves);
    } else if (sortKey === "reach") {
      result = [...result].sort((a, b) => getTotal(b, "reach") - getTotal(a, "reach"));
    } else if (sortKey === "engagement") {
      result = [...result].sort(
        (a, b) => parseFloat(b.engagementRate) - parseFloat(a.engagementRate)
      );
    }
    return result;
  };

  const handleExportPDF = async () => {
    if (!data) return;
    setExportingPDF(true);
    try {
      await exportPDF({
        client,
        from,
        to,
        fbPosts: data.fbPosts,
        igPosts: data.igPosts,
        boostedMap,
        fbFollows,
        igFollows,
        fbPageViews,
        igProfileViews,
        fbReachBreakdown,
        igReachBreakdown,
      });
    } finally {
      setExportingPDF(false);
    }
  };

  const handleExportCSV = () => {
    if (!data) return;
    setExportingCSV(true);
    try {
      exportCSV({
        client,
        from,
        to,
        fbPosts: data.fbPosts,
        igPosts: data.igPosts,
        boostedMap,
        fbFollows,
        igFollows,
        fbPageViews,
        igProfileViews,
        fbReachBreakdown,
        igReachBreakdown,
      });
    } finally {
      setExportingCSV(false);
    }
  };

  const handleDeepReport = () => {
    if (!data) return;
    const payload = buildSocialReportPayload(
      data.fbPosts,
      data.igPosts,
      boostedMap as any,
      fbFollows,
      igFollows,
      fbPageViews,
      igProfileViews,
      client,
      from,
      to,
      platform,
      fbReachBreakdown,        // ← add
  igReachBreakdown,        // ← add
  {                        // ← add comparisonData
    from: comparisonRange.from,
    to: comparisonRange.to,
    fbPosts: comparisonData?.fbPosts ?? [],
    igPosts: comparisonData?.igPosts ?? [],
    fbFollows: comparisonAudience.fbFollows,
    igFollows: comparisonAudience.igFollows,
    fbPageViews: comparisonAudience.fbPageViews,
    igProfileViews: comparisonAudience.igProfileViews,
    fbReachBreakdown: comparisonFbReachBreakdown,
    igReachBreakdown: comparisonIgReachBreakdown,
  }
    );
    generateManusReport(payload);
  };

  const fromLabel = new Date(from).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const toLabel = new Date(to).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const sortTabs: { key: SortKey; label: string }[] = [
    { key: "default", label: "Latest" },
    { key: "likes", label: "Top Likes" },
    { key: "comments", label: "Top Comments" },
    { key: "shares", label: "Top Shares" },
    { key: "saves", label: "Top Saves" },
    { key: "reach", label: "Top Reach" },
    { key: "engagement", label: "Top Engagement" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[62vh] px-4">
        <div
          className={`w-full max-w-xl rounded-[28px] border p-8 relative overflow-hidden ${dark
              ? "bg-[#0f1220] border-white/[0.08]"
              : "bg-white border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
            }`}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-10 -left-8 w-40 h-40 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full bg-fuchsia-400/10 blur-3xl" />
          </div>

          <div className="relative flex flex-col items-center text-center gap-5">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border border-blue-500/20 animate-ping" />
              <div className="absolute inset-2 rounded-full border border-fuchsia-400/25 animate-pulse" />
              <div className="absolute inset-[18px] rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 shadow-[0_0_35px_rgba(147,51,234,0.35)]" />
            </div>

            <div className="w-full max-w-md">
              <div className={`h-2 rounded-full overflow-hidden ${dark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-pink-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {STEPS.map((item, i) => (
                <span
                  key={item}
                  className={`px-2.5 py-1 rounded-full text-[10px] tracking-wide ${i < step
                      ? "bg-blue-600 text-white"
                      : i === step
                        ? "bg-fuchsia-600 text-white"
                        : dark
                          ? "bg-white/[0.05] text-white/35"
                          : "bg-slate-100 text-slate-400"
                    }`}
                >
                  {item}
                </span>
              ))}
            </div>

            <div>
              <p className={`text-[15px] font-semibold ${dark ? "text-white/80" : "text-slate-900"}`}>
                Building your social media report
              </p>
              <p className={`text-[12px] mt-1 ${dark ? "text-white/35" : "text-slate-500"}`}>
                {STEPS[step]}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-[13px] text-red-400">{error}</p>
        </div>
        <button
          onClick={onBack}
          className={`text-[12px] px-4 py-2 rounded-lg border transition-all ${dark
              ? "border-white/10 text-white/40 hover:text-white/80"
: "border-slate-300 text-slate-500 hover:text-slate-800"
            }`}
        >
          ← Back
        </button>
      </div>
    );
  }

  if (publicInstagram) {
    return (
      <PublicInstagramReport
        client={client}
        fromLabel={fromLabel}
        toLabel={toLabel}
        profile={publicInstagram}
        dark={dark}
        onBack={onBack}
      />
    );
  }

  if (!data) return null;

  const activePosts = getFilteredSorted(activeTab === "FB" ? data.fbPosts : data.igPosts);
  const showSaves = activeTab === "IG";

  return (
    <div className="w-full max-w-[1680px] mx-auto flex flex-col gap-6 pb-16 px-3 sm:px-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onBack}
          className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition-all ${dark
              ? "border-white/10 text-white/40 hover:text-white/80 hover:border-white/20"
              : "border-black/10 text-black/40 hover:text-black/70"
            }`}
        >
          ← Back
        </button>

        <div className="flex items-center gap-2">
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-black/10"}`} />
          <span className={`text-[11px] tracking-widest uppercase font-medium ${dark ? "text-white/25" : "text-black/25"}`}>
            Social Media Report &middot; {fromLabel} &ndash; {toLabel}
          </span>
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-black/10"}`} />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${dark
                ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                : "border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-600/50"
              }`}
          >
            {exportingCSV ? (
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            )}
            Export CSV
          </button>

          <button
            onClick={handleExportPDF}
            disabled={exportingPDF}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${dark
                ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/50"
                : "border-blue-600/30 text-blue-700 hover:bg-blue-50 hover:border-blue-600/50"
              }`}
          >
            {exportingPDF ? (
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M9 13h6M9 17h6M9 9h1" />
              </svg>
            )}
            Export PDF
          </button>

          <button
            onClick={handleDeepReport}
            disabled={isGeneratingManus}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 ${dark
                ? "border-fuchsia-500/30 text-fuchsia-400 hover:bg-fuchsia-500/10"
                : "border-fuchsia-600/30 text-fuchsia-700 hover:bg-fuchsia-50"
              }`}
          >
            {isGeneratingManus ? (
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8L12 3z" />
              </svg>
            )}
            {isGeneratingManus ? manusState.brief || "Analyzing…" : "Deep Report PDF"}
          </button>
        </div>
      </div>

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
          comparisonPosts={comparisonData?.fbPosts || []}
          comparisonBoostedMap={comparisonBoostedMap}
          comparisonFollows={comparisonAudience.fbFollows}
          comparisonProfileViews={comparisonAudience.fbPageViews}
          comparisonRangeLabel={`${comparisonRange.from} to ${comparisonRange.to}`}
          comparisonLoading={comparisonLoading}
          reachBreakdown={fbReachBreakdown}
          comparisonReachBreakdown={comparisonFbReachBreakdown}
        />
      )}

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
          comparisonPosts={comparisonData?.igPosts || []}
          comparisonBoostedMap={comparisonBoostedMap}
          comparisonFollows={comparisonAudience.igFollows}
          comparisonProfileViews={comparisonAudience.igProfileViews}
          comparisonRangeLabel={`${comparisonRange.from} to ${comparisonRange.to}`}
          comparisonLoading={comparisonLoading}
          reachBreakdown={igReachBreakdown}
          comparisonReachBreakdown={comparisonIgReachBreakdown}
        />
      )}

      <div className={`h-px w-full ${dark ? "bg-white/[0.05]" : "bg-slate-200"}`} />

      <div className="flex flex-col gap-3">
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${dark ? "text-white/25" : "text-black/25"}`}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by caption..."
            className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm transition-all focus:outline-none ${dark
                ? "bg-white/[0.03] border border-white/[0.07] text-white placeholder:text-white/20 focus:border-blue-500/40"
                : "bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
              }`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {sortTabs.map((tab) =>
            tab.key === "saves" && platform === "FB" ? null : (
              <button
                key={tab.key}
                onClick={() => setSortKey(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all duration-200 ${sortKey === tab.key
                    ? "bg-blue-600 text-white shadow-[0_2px_10px_rgba(59,130,246,0.3)]"
                    : dark
                      ? "bg-white/[0.04] text-white/35 hover:text-white/60 border border-white/[0.06]"
: "bg-slate-100 text-slate-500 hover:text-slate-700 border border-slate-200"
                  }`}
              >
                {tab.label}
              </button>
            )
          )}
        </div>
      </div>

      {platform === "BOTH" && (
        <div className={`flex rounded-xl p-1 gap-1 w-fit ${dark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-slate-100 border border-slate-200"}`}>
          <button
            onClick={() => setActiveTab("FB")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200 ${activeTab === "FB"
                ? "bg-blue-600 text-white shadow-[0_2px_12px_rgba(59,130,246,0.3)]"
                : dark
                  ? "text-white/40 hover:text-white/70"
: "text-slate-500 hover:text-slate-800"
              }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
            </svg>
            Facebook ({data.fbPosts.length})
          </button>

          <button
            onClick={() => setActiveTab("IG")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200 ${activeTab === "IG"
                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_2px_12px_rgba(168,85,247,0.3)]"
                : dark
                  ? "text-white/40 hover:text-white/70"
                  : "text-black/40 hover:text-black/70"
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

      <PostTable
        posts={activePosts}
        showSaves={showSaves}
        dark={dark}
        boostedMap={boostedMap}
        isFB={activeTab === "FB"}
        onRowClick={(post, boosted) => {
          setSelectedPost(post);
          setSelectedBoosted(boosted);
        }}
      />

      {selectedPost && (
        <PostModal
          post={selectedPost}
          boosted={selectedBoosted}
          onClose={() => {
            setSelectedPost(null);
            setSelectedBoosted(null);
          }}
          dark={dark}
          showSaves={showSaves}
          platform={activeTab}
          token={cfgToken}
        />
      )}

      <ManusReportToast state={manusState as any} onDismiss={dismissManus} dark={dark} />
    </div>
  );
}
