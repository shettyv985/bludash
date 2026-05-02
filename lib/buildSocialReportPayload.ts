// lib/buildSocialReportPayload.ts
// Crunches raw social media post data into a deeply pre-analyzed payload.
// Manus receives this — it never needs to fetch, calculate, or format.

export interface SocialPost {
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
  skipRate?: number | null; // reels_skip_rate — % of viewers who skipped in first 3s
}

export interface BoostedPostData {
  adName: string;
  amountSpent: string;
  reach: number;
  impressions: number;
  clicks: number;
  cpm: string;
  ctr: string;
  status: string;
  paidLikes: number;
  paidComments: number;
  paidShares: number;
  body: string;
}

export interface ReachBreakdown {
  total: number;
  organic: number;
  paid: number;
}

export interface ComparisonPeriodData {
  from: string;
  to: string;
  fbPosts: SocialPost[];
  igPosts: SocialPost[];
  fbFollows: { follows: number; unfollows: number };
  igFollows: { follows: number; unfollows: number };
  fbPageViews: number;
  igProfileViews: number;
  fbReachBreakdown: ReachBreakdown;
  igReachBreakdown: ReachBreakdown;
}

export interface AnalyzedPost {
  id: string;
  platform: "FB" | "IG";
  type: string;
  createdTime: string;
  caption: string;
  permalink: string;
  // organic
  organicLikes: number;
  organicComments: number;
  organicShares: number;
  organicSaves: number;
  organicReach: number;
  // paid (if boosted)
  isBoosted: boolean;
  amountSpent: number;
  paidLikes: number;
  paidComments: number;
  paidShares: number;
  paidReach: number;
  paidImpressions: number;
  paidClicks: number;
  cpm: number;
  ctr: number;
  // totals
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalReach: number;
  // derived
  engagementRate: number;
  engagementRateFlag: "good" | "warn" | "bad";
  avgWatchTime: number | null;
  skipRate: number | null; // ← NEW: reel skip rate
  // shares
  reachShare: number;
  engagementShare: number;
}

export interface PeriodComparison {
  metric: string;
  platform: "FB" | "IG" | "Both";
  current: number;
  previous: number;
  change: number;       // absolute
  changePct: number;    // percentage change, null if prev = 0
  trend: "up" | "down" | "flat";
}

export interface SocialReportPayload {
  meta: {
    client: string;
    from: string;
    to: string;
    platform: string;
    generatedAt: string;
  };
  summary: {
    // Facebook
    fbPostCount: number;
    fbOrganicLikes: number;
    fbOrganicComments: number;
    fbOrganicShares: number;
    fbOrganicReach: number;
    fbPaidReach: number;
    fbTotalReach: number;
    fbFollows: number;
    fbUnfollows: number;
    fbNetFollows: number;
    fbPageViews: number;
    fbBoostedPostCount: number;
    fbTotalAdSpend: number;
    // Instagram
    igPostCount: number;
    igOrganicLikes: number;
    igOrganicComments: number;
    igOrganicShares: number;
    igOrganicSaves: number;
    igOrganicReach: number;
    igPaidLikes: number;
    igPaidComments: number;
    igPaidShares: number;
    igPaidReach: number;
    igTotalLikes: number;
    igTotalComments: number;
    igTotalShares: number;
    igTotalReach: number;
    igFollows: number;
    igUnfollows: number;
    igNetFollows: number;
    igProfileViews: number;
    igBoostedPostCount: number;
    igTotalAdSpend: number;
    igReelCount: number;
    igCarouselCount: number;
    igImageCount: number;
    // averages
    avgFbEngagementRate: number;
    avgIgEngagementRate: number;
    avgIgReelWatchTime: number | null;
    avgIgReelSkipRate: number | null; // ← NEW
    // reach breakdowns (organic vs paid split)
    fbReachBreakdown: ReachBreakdown;  // ← NEW
    igReachBreakdown: ReachBreakdown;  // ← NEW
  };
  benchmarks: {
    engagementRate: { good: number; ok: number; unit: string };
    reachRate: { note: string };
    skipRate: { good: number; ok: number; unit: string }; // ← NEW
  };
  posts: AnalyzedPost[];
  rankings: {
    fbTopReach: AnalyzedPost[];
    fbTopEngagement: AnalyzedPost[];
    fbTopLikes: AnalyzedPost[];
    fbWorstEngagement: AnalyzedPost[];
    igTopReach: AnalyzedPost[];
    igTopEngagement: AnalyzedPost[];
    igTopLikes: AnalyzedPost[];
    igTopSaves: AnalyzedPost[];
    igWorstEngagement: AnalyzedPost[];
    igTopReels: AnalyzedPost[];
    igBestWatchTime: AnalyzedPost[];   // ← NEW
    igWorstSkipRate: AnalyzedPost[];   // ← NEW (highest skip = worst hook)
    igBestSkipRate: AnalyzedPost[];    // ← NEW (lowest skip = best hook retention)
    boostedPosts: AnalyzedPost[];
    highSpendLowEngagement: AnalyzedPost[];
  };
  redFlags: Array<{
    postId: string;
    platform: "FB" | "IG";
    postCaption: string;
    issue: string;
    severity: "critical" | "high" | "medium";
    data: string;
  }>;
  positives: Array<{
    postId: string;
    platform: "FB" | "IG";
    postCaption: string;
    highlight: string;
    data: string;
  }>;
  contentMix: {
    fb: { image: number; reel: number; other: number };
    ig: { image: number; reel: number; carousel: number };
    igReelAvgEngagement: number;
    igCarouselAvgEngagement: number;
    igImageAvgEngagement: number;
    igReelAvgWatchTime: number | null;  // ← NEW
    igReelAvgSkipRate: number | null;   // ← NEW
  };
  // ── NEW: MoM / period comparison ─────────────────────────────────────────
  comparison: {
    periodLabel: string; // e.g. "01 Apr 2025 – 30 Apr 2025"
    available: boolean;  // false when no comparison data passed in
    metrics: PeriodComparison[];
    fbReachBreakdown: ReachBreakdown;
    igReachBreakdown: ReachBreakdown;
    fbPostCount: number;
    igPostCount: number;
    fbFollows: { follows: number; unfollows: number; net: number };
    igFollows: { follows: number; unfollows: number; net: number };
    fbPageViews: number;
    igProfileViews: number;
    summary: string; // pre-built one-liner: "IG engagement up 34%, FB reach down 12% vs prior period"
  };
}

const BENCHMARKS = {
  engagementRate: { good: 3, ok: 1, unit: "%" },
  reachRate: { note: "Organic reach is highly variable; focus on engagement rate as primary signal" },
  skipRate: { good: 25, ok: 50, unit: "%" }, // lower is better; ≤25% = good hook
};

function flag(value: number, bench: { good: number; ok: number }): "good" | "warn" | "bad" {
  if (value >= bench.good) return "good";
  if (value >= bench.ok) return "warn";
  return "bad";
}

function round(n: number, d = 2) {
  return +n.toFixed(d);
}

function topN<T>(arr: T[], key: (x: T) => number, n = 5, asc = false): T[] {
  return [...arr]
    .sort((a, b) => (asc ? key(a) - key(b) : key(b) - key(a)))
    .slice(0, n);
}

function avgEngagement(posts: AnalyzedPost[]): number {
  if (!posts.length) return 0;
  return round(posts.reduce((s, p) => s + p.engagementRate, 0) / posts.length);
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return round(((current - previous) / previous) * 100);
}

function buildComparison(
  comparison: ComparisonPeriodData | null | undefined,
  currentSummary: SocialReportPayload["summary"],
  fbFollows: { follows: number; unfollows: number },
  igFollows: { follows: number; unfollows: number },
  fbPageViews: number,
  igProfileViews: number
): SocialReportPayload["comparison"] {
  const empty: SocialReportPayload["comparison"] = {
    periodLabel: "N/A",
    available: false,
    metrics: [],
    fbReachBreakdown: { total: 0, organic: 0, paid: 0 },
    igReachBreakdown: { total: 0, organic: 0, paid: 0 },
    fbPostCount: 0,
    igPostCount: 0,
    fbFollows: { follows: 0, unfollows: 0, net: 0 },
    igFollows: { follows: 0, unfollows: 0, net: 0 },
    fbPageViews: 0,
    igProfileViews: 0,
    summary: "No comparison period data available.",
  };

  if (!comparison) return empty;

  const prevFbPosts = comparison.fbPosts ?? [];
  const prevIgPosts = comparison.igPosts ?? [];

  const prevFbLikes = prevFbPosts.reduce((s, p) => s + p.likes, 0);
  const prevFbComments = prevFbPosts.reduce((s, p) => s + p.comments, 0);
  const prevFbShares = prevFbPosts.reduce((s, p) => s + p.shares, 0);
  const prevFbReach = comparison.fbReachBreakdown?.total ?? prevFbPosts.reduce((s, p) => s + p.reach, 0);

  const prevIgLikes = prevIgPosts.reduce((s, p) => s + p.likes, 0);
  const prevIgComments = prevIgPosts.reduce((s, p) => s + p.comments, 0);
  const prevIgShares = prevIgPosts.reduce((s, p) => s + p.shares, 0);
  const prevIgSaves = prevIgPosts.reduce((s, p) => s + p.saves, 0);
  const prevIgReach = comparison.igReachBreakdown?.total ?? prevIgPosts.reduce((s, p) => s + p.reach, 0);

  const prevFbNet = (comparison.fbFollows?.follows ?? 0) - (comparison.fbFollows?.unfollows ?? 0);
  const prevIgNet = (comparison.igFollows?.follows ?? 0) - (comparison.igFollows?.unfollows ?? 0);
  const currFbNet = fbFollows.follows - fbFollows.unfollows;
  const currIgNet = igFollows.follows - igFollows.unfollows;

  const metrics: PeriodComparison[] = [
    { metric: "FB Organic Likes", platform: "FB", current: currentSummary.fbOrganicLikes, previous: prevFbLikes, change: currentSummary.fbOrganicLikes - prevFbLikes, changePct: pctChange(currentSummary.fbOrganicLikes, prevFbLikes), trend: currentSummary.fbOrganicLikes >= prevFbLikes ? (currentSummary.fbOrganicLikes === prevFbLikes ? "flat" : "up") : "down" },
    { metric: "FB Organic Comments", platform: "FB", current: currentSummary.fbOrganicComments, previous: prevFbComments, change: currentSummary.fbOrganicComments - prevFbComments, changePct: pctChange(currentSummary.fbOrganicComments, prevFbComments), trend: currentSummary.fbOrganicComments >= prevFbComments ? (currentSummary.fbOrganicComments === prevFbComments ? "flat" : "up") : "down" },
    { metric: "FB Organic Shares", platform: "FB", current: currentSummary.fbOrganicShares, previous: prevFbShares, change: currentSummary.fbOrganicShares - prevFbShares, changePct: pctChange(currentSummary.fbOrganicShares, prevFbShares), trend: currentSummary.fbOrganicShares >= prevFbShares ? (currentSummary.fbOrganicShares === prevFbShares ? "flat" : "up") : "down" },
    { metric: "FB Total Reach", platform: "FB", current: currentSummary.fbTotalReach, previous: prevFbReach, change: currentSummary.fbTotalReach - prevFbReach, changePct: pctChange(currentSummary.fbTotalReach, prevFbReach), trend: currentSummary.fbTotalReach >= prevFbReach ? (currentSummary.fbTotalReach === prevFbReach ? "flat" : "up") : "down" },
    { metric: "FB Net Followers", platform: "FB", current: currFbNet, previous: prevFbNet, change: currFbNet - prevFbNet, changePct: pctChange(currFbNet, prevFbNet), trend: currFbNet >= prevFbNet ? (currFbNet === prevFbNet ? "flat" : "up") : "down" },
    { metric: "FB Page Views", platform: "FB", current: fbPageViews, previous: comparison.fbPageViews ?? 0, change: fbPageViews - (comparison.fbPageViews ?? 0), changePct: pctChange(fbPageViews, comparison.fbPageViews ?? 0), trend: fbPageViews >= (comparison.fbPageViews ?? 0) ? (fbPageViews === (comparison.fbPageViews ?? 0) ? "flat" : "up") : "down" },
    { metric: "IG Total Likes", platform: "IG", current: currentSummary.igTotalLikes, previous: prevIgLikes, change: currentSummary.igTotalLikes - prevIgLikes, changePct: pctChange(currentSummary.igTotalLikes, prevIgLikes), trend: currentSummary.igTotalLikes >= prevIgLikes ? (currentSummary.igTotalLikes === prevIgLikes ? "flat" : "up") : "down" },
    { metric: "IG Organic Comments", platform: "IG", current: currentSummary.igOrganicComments, previous: prevIgComments, change: currentSummary.igOrganicComments - prevIgComments, changePct: pctChange(currentSummary.igOrganicComments, prevIgComments), trend: currentSummary.igOrganicComments >= prevIgComments ? (currentSummary.igOrganicComments === prevIgComments ? "flat" : "up") : "down" },
    { metric: "IG Organic Shares", platform: "IG", current: currentSummary.igOrganicShares, previous: prevIgShares, change: currentSummary.igOrganicShares - prevIgShares, changePct: pctChange(currentSummary.igOrganicShares, prevIgShares), trend: currentSummary.igOrganicShares >= prevIgShares ? (currentSummary.igOrganicShares === prevIgShares ? "flat" : "up") : "down" },
    { metric: "IG Organic Saves", platform: "IG", current: currentSummary.igOrganicSaves, previous: prevIgSaves, change: currentSummary.igOrganicSaves - prevIgSaves, changePct: pctChange(currentSummary.igOrganicSaves, prevIgSaves), trend: currentSummary.igOrganicSaves >= prevIgSaves ? (currentSummary.igOrganicSaves === prevIgSaves ? "flat" : "up") : "down" },
    { metric: "IG Total Reach", platform: "IG", current: currentSummary.igTotalReach, previous: prevIgReach, change: currentSummary.igTotalReach - prevIgReach, changePct: pctChange(currentSummary.igTotalReach, prevIgReach), trend: currentSummary.igTotalReach >= prevIgReach ? (currentSummary.igTotalReach === prevIgReach ? "flat" : "up") : "down" },
    { metric: "IG Net Followers", platform: "IG", current: currIgNet, previous: prevIgNet, change: currIgNet - prevIgNet, changePct: pctChange(currIgNet, prevIgNet), trend: currIgNet >= prevIgNet ? (currIgNet === prevIgNet ? "flat" : "up") : "down" },
    { metric: "IG Profile Views", platform: "IG", current: igProfileViews, previous: comparison.igProfileViews ?? 0, change: igProfileViews - (comparison.igProfileViews ?? 0), changePct: pctChange(igProfileViews, comparison.igProfileViews ?? 0), trend: igProfileViews >= (comparison.igProfileViews ?? 0) ? (igProfileViews === (comparison.igProfileViews ?? 0) ? "flat" : "up") : "down" },
  ];

  // Build a quick human-readable summary line
  const notable = metrics
    .filter((m) => Math.abs(m.changePct) >= 10)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 4)
    .map((m) => `${m.metric} ${m.trend === "up" ? "▲" : "▼"}${Math.abs(m.changePct)}%`);
  const summaryLine = notable.length
    ? notable.join(" · ") + " vs prior period"
    : "Metrics are broadly stable vs prior period";

  return {
    periodLabel: `${comparison.from} – ${comparison.to}`,
    available: true,
    metrics,
    fbReachBreakdown: comparison.fbReachBreakdown ?? { total: prevFbReach, organic: prevFbReach, paid: 0 },
    igReachBreakdown: comparison.igReachBreakdown ?? { total: prevIgReach, organic: prevIgReach, paid: 0 },
    fbPostCount: prevFbPosts.length,
    igPostCount: prevIgPosts.length,
    fbFollows: { follows: comparison.fbFollows?.follows ?? 0, unfollows: comparison.fbFollows?.unfollows ?? 0, net: prevFbNet },
    igFollows: { follows: comparison.igFollows?.follows ?? 0, unfollows: comparison.igFollows?.unfollows ?? 0, net: prevIgNet },
    fbPageViews: comparison.fbPageViews ?? 0,
    igProfileViews: comparison.igProfileViews ?? 0,
    summary: summaryLine,
  };
}

export function buildSocialReportPayload(
  fbPosts: SocialPost[],
  igPosts: SocialPost[],
  boostedMap: Record<string, BoostedPostData>,
  fbFollows: { follows: number; unfollows: number },
  igFollows: { follows: number; unfollows: number },
  fbPageViews: number,
  igProfileViews: number,
  client: string,
  from: string,
  to: string,
  platform: string,
  // ── NEW optional params ───────────────────────────────────────────────────
  fbReachBreakdown?: ReachBreakdown,
  igReachBreakdown?: ReachBreakdown,
  comparisonData?: ComparisonPeriodData | null
): SocialReportPayload {

  function matchBoosted(post: SocialPost): BoostedPostData | null {
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

  function analyzePost(post: SocialPost, platForm: "FB" | "IG"): AnalyzedPost {
    const b = matchBoosted(post);
    const isFB = platForm === "FB";
    const paidLikes = isFB ? 0 : (b?.paidLikes ?? 0);
    const paidComments = isFB ? 0 : (b?.paidComments ?? 0);
    const paidShares = isFB ? 0 : (b?.paidShares ?? 0);
    const paidReach = b?.reach ?? 0;
    const totalLikes = post.likes + paidLikes;
    const totalComments = post.comments + paidComments;
    const totalShares = post.shares + paidShares;
    const totalReach = post.reach + paidReach;
    const engagementRate = totalReach > 0
      ? round(((totalLikes + totalComments + totalShares + (isFB ? 0 : post.saves)) / totalReach) * 100)
      : 0;

    return {
      id: post.id,
      platform: platForm,
      type: post.type,
      createdTime: post.createdTime,
      caption: post.message.substring(0, 120),
      permalink: post.permalink,
      organicLikes: post.likes,
      organicComments: post.comments,
      organicShares: post.shares,
      organicSaves: post.saves,
      organicReach: post.reach,
      isBoosted: !!b,
      amountSpent: b ? parseFloat(b.amountSpent) : 0,
      paidLikes,
      paidComments,
      paidShares,
      paidReach,
      paidImpressions: b?.impressions ?? 0,
      paidClicks: b?.clicks ?? 0,
      cpm: b ? parseFloat(b.cpm) : 0,
      ctr: b ? parseFloat(b.ctr) : 0,
      totalLikes,
      totalComments,
      totalShares,
      totalReach,
      engagementRate,
      engagementRateFlag: flag(engagementRate, BENCHMARKS.engagementRate),
      avgWatchTime: post.avgWatchTime ?? null,
      skipRate: post.skipRate ?? null, // ← NEW
      reachShare: 0, // filled below
      engagementShare: 0, // filled below
    };
  }

  const analyzedFB = fbPosts.map((p) => analyzePost(p, "FB"));
  const analyzedIG = igPosts.map((p) => analyzePost(p, "IG"));
  const allAnalyzed = [...analyzedFB, ...analyzedIG];

  // Fill reach/engagement shares
  const totalFBReach = analyzedFB.reduce((s, p) => s + p.totalReach, 0) || 1;
  const totalIGReach = analyzedIG.reduce((s, p) => s + p.totalReach, 0) || 1;
  const totalFBEng = analyzedFB.reduce((s, p) => s + p.totalLikes + p.totalComments + p.totalShares, 0) || 1;
  const totalIGEng = analyzedIG.reduce((s, p) => s + p.totalLikes + p.totalComments + p.totalShares + p.organicSaves, 0) || 1;

  analyzedFB.forEach((p) => {
    p.reachShare = round((p.totalReach / totalFBReach) * 100);
    p.engagementShare = round(((p.totalLikes + p.totalComments + p.totalShares) / totalFBEng) * 100);
  });
  analyzedIG.forEach((p) => {
    p.reachShare = round((p.totalReach / totalIGReach) * 100);
    p.engagementShare = round(((p.totalLikes + p.totalComments + p.totalShares + p.organicSaves) / totalIGEng) * 100);
  });

  // Summary
  const fbBoosted = analyzedFB.filter((p) => p.isBoosted);
  const igBoosted = analyzedIG.filter((p) => p.isBoosted);
  const fbOrganicLikes = analyzedFB.reduce((s, p) => s + p.organicLikes, 0);
  const fbOrganicComments = analyzedFB.reduce((s, p) => s + p.organicComments, 0);
  const fbOrganicShares = analyzedFB.reduce((s, p) => s + p.organicShares, 0);
  const fbOrganicReach = analyzedFB.reduce((s, p) => s + p.organicReach, 0);
  const fbPaidReach = analyzedFB.reduce((s, p) => s + p.paidReach, 0);
  const igOrganicLikes = analyzedIG.reduce((s, p) => s + p.organicLikes, 0);
  const igOrganicComments = analyzedIG.reduce((s, p) => s + p.organicComments, 0);
  const igOrganicShares = analyzedIG.reduce((s, p) => s + p.organicShares, 0);
  const igOrganicSaves = analyzedIG.reduce((s, p) => s + p.organicSaves, 0);
  const igOrganicReach = analyzedIG.reduce((s, p) => s + p.organicReach, 0);
  const igPaidLikes = analyzedIG.reduce((s, p) => s + p.paidLikes, 0);
  const igPaidComments = analyzedIG.reduce((s, p) => s + p.paidComments, 0);
  const igPaidShares = analyzedIG.reduce((s, p) => s + p.paidShares, 0);
  const igPaidReach = analyzedIG.reduce((s, p) => s + p.paidReach, 0);

  const igReels = analyzedIG.filter((p) => p.type === "REEL");
  const igCarousels = analyzedIG.filter((p) => p.type === "CAROUSEL");
  const igImages = analyzedIG.filter((p) => p.type === "IMAGE");

  const reelsWithWatch = igReels.filter((p) => p.avgWatchTime != null);
  const avgReelWatch = reelsWithWatch.length
    ? round(reelsWithWatch.reduce((s, p) => s + (p.avgWatchTime ?? 0), 0) / reelsWithWatch.length)
    : null;

  // ── NEW: skip rate aggregates ─────────────────────────────────────────────
  const reelsWithSkip = igReels.filter((p) => p.skipRate != null);
  const avgReelSkipRate = reelsWithSkip.length
    ? round(reelsWithSkip.reduce((s, p) => s + (p.skipRate ?? 0), 0) / reelsWithSkip.length, 1)
    : null;

  // ── Resolved reach breakdowns (use passed-in values or derive from posts) ─
  const resolvedFbReachBreakdown: ReachBreakdown = fbReachBreakdown ?? {
    organic: fbOrganicReach,
    paid: fbPaidReach,
    total: fbOrganicReach + fbPaidReach,
  };
  const resolvedIgReachBreakdown: ReachBreakdown = igReachBreakdown ?? {
    organic: igOrganicReach,
    paid: igPaidReach,
    total: igOrganicReach + igPaidReach,
  };

  // Build summary object (needed for comparison builder)
  const summary: SocialReportPayload["summary"] = {
    fbPostCount: analyzedFB.length,
    fbOrganicLikes,
    fbOrganicComments,
    fbOrganicShares,
    fbOrganicReach,
    fbPaidReach,
    fbTotalReach: resolvedFbReachBreakdown.total,
    fbFollows: fbFollows.follows,
    fbUnfollows: fbFollows.unfollows,
    fbNetFollows: fbFollows.follows - fbFollows.unfollows,
    fbPageViews,
    fbBoostedPostCount: fbBoosted.length,
    fbTotalAdSpend: round(fbBoosted.reduce((s, p) => s + p.amountSpent, 0)),
    igPostCount: analyzedIG.length,
    igOrganicLikes,
    igOrganicComments,
    igOrganicShares,
    igOrganicSaves,
    igOrganicReach,
    igPaidLikes,
    igPaidComments,
    igPaidShares,
    igPaidReach,
    igTotalLikes: igOrganicLikes + igPaidLikes,
    igTotalComments: igOrganicComments + igPaidComments,
    igTotalShares: igOrganicShares + igPaidShares,
    igTotalReach: resolvedIgReachBreakdown.total,
    igFollows: igFollows.follows,
    igUnfollows: igFollows.unfollows,
    igNetFollows: igFollows.follows - igFollows.unfollows,
    igProfileViews,
    igBoostedPostCount: igBoosted.length,
    igTotalAdSpend: round(igBoosted.reduce((s, p) => s + p.amountSpent, 0)),
    igReelCount: igReels.length,
    igCarouselCount: igCarousels.length,
    igImageCount: igImages.length,
    avgFbEngagementRate: avgEngagement(analyzedFB),
    avgIgEngagementRate: avgEngagement(analyzedIG),
    avgIgReelWatchTime: avgReelWatch,
    avgIgReelSkipRate: avgReelSkipRate, // ← NEW
    fbReachBreakdown: resolvedFbReachBreakdown, // ← NEW
    igReachBreakdown: resolvedIgReachBreakdown, // ← NEW
  };

  // Red flags
  const redFlags: SocialReportPayload["redFlags"] = [];
  for (const p of allAnalyzed) {
    if (p.isBoosted && p.amountSpent > 500 && p.engagementRate < 1) {
      redFlags.push({
        postId: p.id,
        platform: p.platform,
        postCaption: p.caption,
        issue: "Boosted post with significant spend but critically low engagement",
        severity: "critical",
        data: `Spent: ₹${p.amountSpent}, Engagement rate: ${p.engagementRate}%, Reach: ${p.totalReach}`,
      });
    }
    if (p.engagementRate < 0.5 && p.totalReach > 1000) {
      redFlags.push({
        postId: p.id,
        platform: p.platform,
        postCaption: p.caption,
        issue: "High reach but extremely low engagement — content is not resonating",
        severity: "high",
        data: `Engagement rate: ${p.engagementRate}%, Reach: ${p.totalReach}, Likes: ${p.totalLikes}`,
      });
    }
    if (p.platform === "IG" && p.type === "REEL" && p.avgWatchTime != null && p.avgWatchTime < 5) {
      redFlags.push({
        postId: p.id,
        platform: p.platform,
        postCaption: p.caption,
        issue: "Reel with very low average watch time — hook is not working",
        severity: "high",
        data: `Avg watch time: ${p.avgWatchTime}s, Engagement rate: ${p.engagementRate}%`,
      });
    }
    // ── NEW: flag bad skip rate ───────────────────────────────────────────
    if (p.platform === "IG" && p.type === "REEL" && p.skipRate != null && p.skipRate > 60) {
      redFlags.push({
        postId: p.id,
        platform: p.platform,
        postCaption: p.caption,
        issue: "Reel with critically high skip rate — viewers are swiping away in first 3 seconds",
        severity: "high",
        data: `Skip rate: ${p.skipRate}%, Avg watch time: ${p.avgWatchTime ?? "—"}s, Reach: ${p.totalReach}`,
      });
    }
    if (p.isBoosted && p.ctr < 0.5 && p.amountSpent > 200) {
      redFlags.push({
        postId: p.id,
        platform: p.platform,
        postCaption: p.caption,
        issue: "Boosted post with critically low CTR — creative or audience mismatch",
        severity: "high",
        data: `CTR: ${p.ctr}%, Spend: ₹${p.amountSpent}, CPM: ₹${p.cpm}`,
      });
    }
  }

  // Positives
  const positives: SocialReportPayload["positives"] = [];
  for (const p of allAnalyzed) {
    if (p.engagementRateFlag === "good" && p.totalReach > 200) {
      positives.push({
        postId: p.id,
        platform: p.platform,
        postCaption: p.caption,
        highlight: "High engagement rate — content is strongly resonating with the audience",
        data: `Engagement rate: ${p.engagementRate}%, Reach: ${p.totalReach}, Likes: ${p.totalLikes}`,
      });
    }
    if (p.platform === "IG" && p.type === "REEL" && p.avgWatchTime != null && p.avgWatchTime > 15) {
      positives.push({
        postId: p.id,
        platform: p.platform,
        postCaption: p.caption,
        highlight: "Reel with strong watch time — hook and content are compelling",
        data: `Avg watch time: ${p.avgWatchTime}s, Engagement rate: ${p.engagementRate}%`,
      });
    }
    // ── NEW: praise great skip rate ───────────────────────────────────────
    if (p.platform === "IG" && p.type === "REEL" && p.skipRate != null && p.skipRate < 20) {
      positives.push({
        postId: p.id,
        platform: p.platform,
        postCaption: p.caption,
        highlight: "Reel with excellent hook retention — very few viewers skip in first 3 seconds",
        data: `Skip rate: ${p.skipRate}%, Avg watch time: ${p.avgWatchTime ?? "—"}s, Reach: ${p.totalReach}`,
      });
    }
    if (p.isBoosted && p.ctr > 1.5) {
      positives.push({
        postId: p.id,
        platform: p.platform,
        postCaption: p.caption,
        highlight: "Boosted post with excellent CTR — creative is performing well as a paid post",
        data: `CTR: ${p.ctr}%, Spend: ₹${p.amountSpent}, Reach: ${p.totalReach}`,
      });
    }
  }

  // Rankings
  const boostedPosts = allAnalyzed.filter((p) => p.isBoosted);
  const highSpendLowEng = boostedPosts
    .filter((p) => p.amountSpent > 300 && p.engagementRate < 1.5)
    .sort((a, b) => b.amountSpent - a.amountSpent)
    .slice(0, 5);

  // ── NEW: reel-specific rankings ───────────────────────────────────────────
  const reelsWithWatchAnalyzed = igReels.filter((p) => p.avgWatchTime != null);
  const reelsWithSkipAnalyzed = igReels.filter((p) => p.skipRate != null);

  // Limit contentRankings to top 20 by engagement to prevent Manus truncation
  const contentRankingsPool = [...allAnalyzed]
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 20);

  return {
    meta: { client, from, to, platform, generatedAt: new Date().toISOString() },
    summary,
    benchmarks: BENCHMARKS,
    posts: allAnalyzed,
    rankings: {
      fbTopReach: topN(analyzedFB, (p) => p.totalReach),
      fbTopEngagement: topN(analyzedFB, (p) => p.engagementRate),
      fbTopLikes: topN(analyzedFB, (p) => p.totalLikes),
      fbWorstEngagement: topN(analyzedFB.filter((p) => p.totalReach > 100), (p) => p.engagementRate, 5, true),
      igTopReach: topN(analyzedIG, (p) => p.totalReach),
      igTopEngagement: topN(analyzedIG, (p) => p.engagementRate),
      igTopLikes: topN(analyzedIG, (p) => p.totalLikes),
      igTopSaves: topN(analyzedIG, (p) => p.organicSaves),
      igWorstEngagement: topN(analyzedIG.filter((p) => p.totalReach > 100), (p) => p.engagementRate, 5, true),
      igTopReels: topN(igReels, (p) => p.engagementRate),
      igBestWatchTime: topN(reelsWithWatchAnalyzed, (p) => p.avgWatchTime ?? 0, 5),       // ← NEW
      igWorstSkipRate: topN(reelsWithSkipAnalyzed, (p) => p.skipRate ?? 0, 5),             // ← NEW (highest skip = worst)
      igBestSkipRate: topN(reelsWithSkipAnalyzed, (p) => p.skipRate ?? 0, 5, true),        // ← NEW (lowest skip = best)
      boostedPosts,
      highSpendLowEngagement: highSpendLowEng,
    },
    redFlags,
    positives,
    contentMix: {
      fb: {
        image: analyzedFB.filter((p) => p.type === "IMAGE").length,
        reel: analyzedFB.filter((p) => p.type === "REEL").length,
        other: analyzedFB.filter((p) => p.type !== "IMAGE" && p.type !== "REEL").length,
      },
      ig: {
        image: igImages.length,
        reel: igReels.length,
        carousel: igCarousels.length,
      },
      igReelAvgEngagement: avgEngagement(igReels),
      igCarouselAvgEngagement: avgEngagement(igCarousels),
      igImageAvgEngagement: avgEngagement(igImages),
      igReelAvgWatchTime: avgReelWatch,   // ← NEW
      igReelAvgSkipRate: avgReelSkipRate, // ← NEW
    },
    // ── NEW: full MoM comparison block ───────────────────────────────────────
    comparison: buildComparison(
      comparisonData,
      summary,
      fbFollows,
      igFollows,
      fbPageViews,
      igProfileViews
    ),
  };
}