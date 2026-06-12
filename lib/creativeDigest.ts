import { ALL_CLIENTS } from "@/lib/auth";
import { buildReportPayload, type ReportPayload } from "@/lib/buildReportPayload";
import type { SocialReportPayload } from "@/lib/buildSocialReportPayload";
import {
  createOpenAIResponse,
  extractJSONFromText,
  getOpenAIReportModel,
  getOpenAIReportReasoningEffort,
} from "@/lib/openaiResponses";
import { sendMail } from "@/lib/mailer";
import { fetchAdsPerformanceSnapshot } from "@/lib/metaAdsPerformanceServer";
import { fetchBoostedPosts, type BoostedPost } from "@/lib/metaBoostedPostsServer";
import {
  buildServerSocialReportPayload,
  fetchSocialReportSnapshot,
} from "@/lib/metaSocialReportServer";
import { getResolvedMetaClientConfig, type MetaClientConfig } from "@/lib/metaClientConfig";

const DEFAULT_TO = "operations@blusteak.com";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

type DigestOptions = {
  from?: string;
  to?: string;
  dryRun?: boolean;
  recipient?: string;
  clientKeys?: string[];
  mode?: DigestMode;
};

type DigestMode = "both" | "performance" | "social";

type ClientDigestInput = {
  clientKey: string;
  clientName: string;
  performance: unknown;
  social: unknown;
  errors: string[];
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function istDateOffset(offsetDays: number, now = new Date()) {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return formatDate(shifted);
}

export function getDefaultCreativeDigestRange(now = new Date()) {
  const lookback = Math.max(1, Number(process.env.CREATIVE_DIGEST_LOOKBACK_DAYS || "2") || 2);
  const includeToday = process.env.CREATIVE_DIGEST_INCLUDE_TODAY === "1";

  return {
    from: istDateOffset(includeToday ? -(lookback - 1) : -lookback, now),
    to: istDateOffset(includeToday ? 0 : -1, now),
  };
}

function getDigestClientKeys(override?: string[]) {
  const configured = (process.env.CREATIVE_DIGEST_CLIENTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const source = override && override.length > 0
    ? override
    : configured.length > 0
      ? configured
      : ALL_CLIENTS.map((client) => client.value);
  const seen = new Set<string>();

  return source.filter((clientKey) => {
    if (!clientKey || clientKey === "ALL" || seen.has(clientKey)) return false;
    seen.add(clientKey);
    return true;
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker())
  );

  return results;
}

function cleanError(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

function truncate(value: string | undefined | null, max = 220) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3)}...`;
}

function uniqueById<T extends { id?: string; name?: string }>(items: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = item.id || item.name || JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

type PerformanceAd = ReportPayload["ads"][number];
type PerformanceCategory =
  | "awareness"
  | "lead_generation"
  | "traffic"
  | "engagement"
  | "video_views"
  | "sales"
  | "other";

function performanceCategory(ad: PerformanceAd): PerformanceCategory {
  const textBlob = `${ad.objective || ""} ${ad.campaign || ""} ${ad.adSet || ""} ${ad.name || ""}`.toLowerCase();

  if (/\b(awareness|reach|brand|thruplay|brand_awareness|outcome_awareness)\b/.test(textBlob)) {
    return "awareness";
  }
  if (/\b(lead|leads|leadgen|lead_generation|outcome_leads)\b/.test(textBlob)) {
    return "lead_generation";
  }
  if (/\b(traffic|link|click|landing|lpv|outcome_traffic)\b/.test(textBlob)) {
    return "traffic";
  }
  if (/\b(engagement|messages|message|whatsapp|post_engagement|outcome_engagement)\b/.test(textBlob)) {
    return "engagement";
  }
  if (/\b(video_views|video view|views|reel views|outcome_video)\b/.test(textBlob)) {
    return "video_views";
  }
  if (/\b(sales|purchase|conversion|conversions|outcome_sales)\b/.test(textBlob)) {
    return "sales";
  }

  return ad.isVideo ? "video_views" : "other";
}

function performanceCategoryLabel(category: PerformanceCategory) {
  const labels: Record<PerformanceCategory, string> = {
    awareness: "Awareness / Reach",
    lead_generation: "Lead generation",
    traffic: "Traffic / Clicks",
    engagement: "Engagement / Messages",
    video_views: "Video views",
    sales: "Sales / Conversion",
    other: "Other",
  };

  return labels[category];
}

function performancePrimaryKpis(category: PerformanceCategory) {
  const kpis: Record<PerformanceCategory, string[]> = {
    awareness: ["reach", "impressions", "CPM", "engagement rate", "frequency/quality signals when available"],
    lead_generation: ["leads", "CPL", "CTR", "CPC", "spend"],
    traffic: ["clicks", "CTR", "CPC", "landing page views"],
    engagement: ["post engagements", "engagement rate", "likes", "comments", "shares"],
    video_views: ["video views", "hook rate", "skip rate", "hold rate", "avg watch time"],
    sales: ["conversion value/ROAS when available", "CPC", "CTR", "spend"],
    other: ["spend", "reach", "CTR", "CPC", "engagement rate"],
  };

  return kpis[category];
}

function performanceEvaluationNote(ad: PerformanceAd, category: PerformanceCategory) {
  switch (category) {
    case "awareness":
      if (ad.cpm <= 50 && ad.reach > 10000) {
        return "Efficient awareness delivery: strong reach and low CPM. Do not flag only because leads/CPL are zero or CTR is low.";
      }
      return "Awareness creative: judge reach, CPM, and engagement quality; ignore leads/CPL unless the campaign is actually lead-gen.";
    case "lead_generation":
      return "Lead-gen creative: leads, CPL, CTR, CPC, and spend are the main decision metrics.";
    case "traffic":
      return "Traffic creative: judge clicks, CTR, CPC, and landing page views.";
    case "engagement":
      return "Engagement creative: judge post engagements, engagement rate, and interaction quality.";
    case "video_views":
      return "Video creative: judge video views, hook rate, skip rate, hold rate, and watch time.";
    case "sales":
      return "Sales/conversion creative: judge conversion intent, CTR, CPC, spend, and available conversion value.";
    case "other":
      return "Unclear objective: use spend, reach, CTR, CPC, and engagement together; do not over-weight one metric.";
  }
}

function performanceRiskScore(ad: PerformanceAd) {
  const category = performanceCategory(ad);
  let score = ad.spendShare;

  switch (category) {
    case "awareness":
      if (ad.cpm > 120 && ad.impressions > 1000) score += 30;
      else if (ad.cpm > 50 && ad.impressions > 1000) score += 14;
      if (ad.reachShare < ad.spendShare * 0.45 && ad.spend > 200) score += 14;
      if (ad.engagementRate < 0.05 && ad.reach > 10000) score += 8;
      if (ad.ctr < 0.03 && ad.clicks === 0 && ad.spend > 500) score += 4;
      break;
    case "lead_generation":
      score = ad.spendShare * 1.5;
      if (ad.spend > 0 && ad.leads === 0) score += 35;
      if (ad.ctr < 0.3 && ad.impressions > 500) score += 24;
      else if (ad.ctr < 0.8 && ad.impressions > 500) score += 12;
      if (ad.cpl > 300 && ad.leads > 0) score += 20;
      if (ad.cpc > 15 && ad.clicks > 0) score += 8;
      if (ad.isVideo && ad.skipRate > 88 && ad.impressions > 500) score += 10;
      break;
    case "traffic":
      if (ad.clicks === 0 && ad.spend > 100) score += 32;
      if (ad.ctr < 0.3 && ad.impressions > 500) score += 28;
      else if (ad.ctr < 0.8 && ad.impressions > 500) score += 14;
      if (ad.cpc > 15 && ad.clicks > 0) score += 16;
      if (ad.landingPageViews === 0 && ad.clicks > 20) score += 10;
      break;
    case "engagement":
      if (ad.engagementRate < 0.5 && ad.reach > 500) score += 30;
      else if (ad.engagementRate < 1 && ad.reach > 500) score += 16;
      if (ad.postEngagements === 0 && ad.spend > 100) score += 20;
      if (ad.cpm > 120 && ad.impressions > 1000) score += 8;
      break;
    case "video_views":
      if (ad.videoViews === 0 && ad.spend > 100) score += 30;
      if (ad.skipRate > 88 && ad.impressions > 500) score += 26;
      else if (ad.skipRate > 75 && ad.impressions > 500) score += 12;
      if (ad.holdRate50 > 0 && ad.holdRate50 < 15) score += 12;
      if (ad.cpm > 120 && ad.impressions > 1000) score += 8;
      break;
    case "sales":
      if (ad.ctr < 0.5 && ad.impressions > 500) score += 20;
      if (ad.cpc > 20 && ad.clicks > 0) score += 16;
      if (ad.spend > 0 && ad.leads === 0) score += 8;
      break;
    case "other":
      if (ad.ctr < 0.3 && ad.impressions > 500) score += 20;
      if (ad.cpm > 120 && ad.impressions > 1000) score += 12;
      if (ad.engagementRate < 1 && ad.reach > 500) score += 8;
      break;
  }

  return Number(score.toFixed(2));
}

function compactPerformancePayload(
  payload: ReportPayload,
  creativeByAdId: Map<string, string>
) {
  const activeAds = payload.ads.filter((ad) => ad.status === "ACTIVE");
  const scopedAds = activeAds.length > 0 ? activeAds : payload.ads;
  const candidateSource = uniqueById([
    ...payload.rankings.highSpendLowReturn,
    ...payload.rankings.worstCTR,
    ...payload.rankings.worstCPL,
    ...payload.rankings.worstCPC,
    ...payload.rankings.worstSkipRate,
    ...payload.rankings.topSpend,
    ...scopedAds,
  ]);
  const categoryOrder: PerformanceCategory[] = [
    "lead_generation",
    "traffic",
    "engagement",
    "video_views",
    "awareness",
    "sales",
    "other",
  ];
  const toCandidate = (ad: PerformanceAd) => {
    const category = performanceCategory(ad);
    return {
      id: ad.id,
      name: ad.name,
      creativeText: truncate(creativeByAdId.get(ad.id), 180),
      campaign: ad.campaign,
      objective: ad.objective,
      adSet: ad.adSet,
      status: ad.status,
      category,
      categoryLabel: performanceCategoryLabel(category),
      primaryKpis: performancePrimaryKpis(category),
      evaluationNote: performanceEvaluationNote(ad, category),
      isVideo: ad.isVideo,
      spend: ad.spend,
      spendShare: ad.spendShare,
      reach: ad.reach,
      impressions: ad.impressions,
      clicks: ad.clicks,
      ctr: ad.ctr,
      cpm: ad.cpm,
      cpc: ad.cpc,
      leads: ad.leads,
      cpl: ad.cpl,
      engagementRate: ad.engagementRate,
      videoViews: ad.videoViews,
      hookRate: ad.hookRate,
      skipRate: ad.skipRate,
      avgWatchTime: ad.avgWatchTime,
      holdRate50: ad.holdRate50,
      completionRate: ad.completionRate,
      riskScore: performanceRiskScore(ad),
    };
  };
  const scoredCandidates = candidateSource
    .map(toCandidate)
    .sort((a, b) => b.riskScore - a.riskScore);
  const candidates = uniqueById(
    categoryOrder.flatMap((category) =>
      scoredCandidates.filter((ad) => ad.category === category).slice(0, 10)
    )
  )
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 60);
  const categories = categoryOrder
    .map((category) => {
      const categoryAds = scopedAds.filter((ad) => performanceCategory(ad) === category);
      const categoryCandidates = candidates
        .filter((ad) => ad.category === category)
        .sort((a, b) => b.riskScore - a.riskScore);
      const spend = categoryAds.reduce((sum, ad) => sum + ad.spend, 0);
      const reach = categoryAds.reduce((sum, ad) => sum + ad.reach, 0);
      const impressions = categoryAds.reduce((sum, ad) => sum + ad.impressions, 0);
      const clicks = categoryAds.reduce((sum, ad) => sum + ad.clicks, 0);
      const leads = categoryAds.reduce((sum, ad) => sum + ad.leads, 0);

      return {
        category,
        label: performanceCategoryLabel(category),
        primaryKpis: performancePrimaryKpis(category),
        adCount: categoryAds.length,
        spend: Number(spend.toFixed(2)),
        reach,
        impressions,
        clicks,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
        cpm: impressions > 0 ? Number(((spend / impressions) * 1000).toFixed(2)) : 0,
        leads,
        cpl: leads > 0 ? Number((spend / leads).toFixed(2)) : 0,
        candidates: categoryCandidates,
      };
    })
    .filter((category) => category.adCount > 0);

  return {
    status: candidates.length > 0 ? "analyzed" : "no_data",
    summary: {
      totalSpend: payload.summary.totalSpend,
      totalReach: payload.summary.totalReach,
      totalImpressions: payload.summary.totalImpressions,
      totalClicks: payload.summary.totalClicks,
      totalLeads: payload.summary.totalLeads,
      overallCTR: payload.summary.overallCTR,
      overallCPM: payload.summary.overallCPM,
      overallCPC: payload.summary.overallCPC,
      overallCPL: payload.summary.overallCPL,
      totalAds: payload.summary.totalAds,
      activeAds: payload.summary.activeAds,
      videoAds: payload.summary.videoAds,
      analyzedAds: payload.ads.length,
      candidatesSent: candidates.length,
      candidateScope: activeAds.length > 0 ? "active_ads" : "ads_with_delivery",
    },
    categoryGuidance: [
      "Judge each category only by its own primary KPIs.",
      "Do not penalize Awareness / Reach ads for zero leads or missing CPL.",
      "For Awareness / Reach, low CPM plus large reach is not weak by itself; flag only if delivery is expensive, reach is poor for spend, or engagement quality is unusually weak.",
      "For Lead generation, zero leads, high CPL, weak CTR, and high CPC are primary red flags.",
      "For Traffic / Clicks, prioritize CTR, CPC, clicks, and landing page views.",
      "For Video views, prioritize hook rate, skip rate, hold rate, watch time, and video views.",
    ],
    categories,
    redFlags: payload.redFlags.slice(0, 10),
    candidates,
  };
}

function socialRiskScore(post: SocialReportPayload["posts"][number]) {
  let score = post.amountSpent * 0.05;
  if (post.isBoosted) score += 10;
  if (post.engagementRate < 0.5 && post.totalReach > 500) score += 32;
  else if (post.engagementRate < 1 && post.totalReach > 500) score += 18;
  if (post.totalReach > 1000 && post.engagementRate < 1) score += 12;
  if (post.skipRate != null && post.skipRate > 60) score += 16;
  if (post.ctr > 0 && post.ctr < 0.5 && post.amountSpent > 200) score += 12;
  return Number(score.toFixed(2));
}

function uniquePosts(posts: SocialReportPayload["posts"]) {
  const seen = new Set<string>();
  const result: SocialReportPayload["posts"] = [];

  for (const post of posts) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    result.push(post);
  }

  return result;
}

function compactSocialPayload(payload: SocialReportPayload) {
  const boostedByRisk = [...payload.rankings.boostedPosts]
    .sort((a, b) => socialRiskScore(b) - socialRiskScore(a))
    .slice(0, 6);
  const candidates = uniquePosts([
    ...payload.rankings.highSpendLowEngagement,
    ...payload.rankings.fbWorstEngagement,
    ...payload.rankings.igWorstEngagement,
    ...payload.rankings.igWorstSkipRate,
    ...boostedByRisk,
    ...payload.posts,
  ])
    .sort((a, b) => socialRiskScore(b) - socialRiskScore(a))
    .slice(0, 50)
    .map((post) => ({
      id: post.id,
      platform: post.platform,
      type: post.type,
      createdTime: post.createdTime,
      caption: truncate(post.caption, 180),
      permalink: post.permalink,
      isBoosted: post.isBoosted,
      amountSpent: post.amountSpent,
      paidReach: post.paidReach,
      paidImpressions: post.paidImpressions,
      paidClicks: post.paidClicks,
      cpm: post.cpm,
      ctr: post.ctr,
      totalReach: post.totalReach,
      totalLikes: post.totalLikes,
      totalComments: post.totalComments,
      totalShares: post.totalShares,
      organicSaves: post.organicSaves,
      views: post.views,
      engagementRate: post.engagementRate,
      avgWatchTime: post.avgWatchTime,
      skipRate: post.skipRate,
      holdRate: post.holdRate,
      riskScore: socialRiskScore(post),
    }));

  return {
    status: candidates.length > 0 ? "analyzed" : "no_data",
    summary: {
      fbPostCount: payload.summary.fbPostCount,
      fbTotalReach: payload.summary.fbTotalReach,
      fbBoostedPostCount: payload.summary.fbBoostedPostCount,
      fbTotalAdSpend: payload.summary.fbTotalAdSpend,
      avgFbEngagementRate: payload.summary.avgFbEngagementRate,
      igPostCount: payload.summary.igPostCount,
      igTotalReach: payload.summary.igTotalReach,
      igBoostedPostCount: payload.summary.igBoostedPostCount,
      igTotalAdSpend: payload.summary.igTotalAdSpend,
      avgIgEngagementRate: payload.summary.avgIgEngagementRate,
      igReelCount: payload.summary.igReelCount,
      igReelViews: payload.summary.igReelViews,
      avgIgReelSkipRate: payload.summary.avgIgReelSkipRate,
      avgIgReelWatchTime: payload.summary.avgIgReelWatchTime,
      analyzedPosts: payload.posts.length,
      candidatesSent: candidates.length,
    },
    redFlags: payload.redFlags.slice(0, 6),
    candidates,
  };
}

async function getBoostedMap(
  config: MetaClientConfig,
  from: string,
  to: string,
  errors: string[]
): Promise<Record<string, BoostedPost>> {
  if (!config.token || !config.adAccountId) return {};

  try {
    return await fetchBoostedPosts(
      { token: config.token, adAccountId: config.adAccountId },
      from,
      to
    );
  } catch (err) {
    errors.push(`Boosted posts: ${cleanError(err)}`);
    return {};
  }
}

async function buildClientDigestInput(
  clientKey: string,
  from: string,
  to: string,
  mode: DigestMode
): Promise<ClientDigestInput> {
  const config = await getResolvedMetaClientConfig(clientKey);
  const errors: string[] = [];

  if (!config) {
    return {
      clientKey,
      clientName: clientKey,
      performance: { status: "skipped", reason: "Invalid client configuration" },
      social: { status: "skipped", reason: "Invalid client configuration" },
      errors: ["Invalid client configuration"],
    };
  }

  let performance: unknown = { status: "skipped", reason: "Missing Meta Ads token or ad account ID" };
  let social: unknown = { status: "skipped", reason: "Missing Meta token or social account IDs" };

  if (mode !== "social" && config.token && config.adAccountId) {
    try {
      const snapshot = await fetchAdsPerformanceSnapshot(
        { token: config.token, adAccountId: config.adAccountId },
        from,
        to
      );
      const payload = buildReportPayload(
        snapshot.ads,
        snapshot.campaigns,
        config.clientKey,
        from,
        to,
        snapshot.accountInsight
      );
      const creativeByAdId = new Map(
        snapshot.ads.map((ad) => [ad.id, ad.creativeText || ""])
      );
      performance = compactPerformancePayload(payload, creativeByAdId);
    } catch (err) {
      errors.push(`Performance: ${cleanError(err)}`);
      performance = { status: "error", reason: cleanError(err) };
    }
  }

  if (mode === "social") {
    performance = { status: "skipped", reason: "Manual email requested social media only" };
  }

  const boostedMap =
    mode !== "performance" ? await getBoostedMap(config, from, to, errors) : {};

  if (mode !== "performance" && config.token && (config.fbPageId || config.igUserId)) {
    try {
      const platform = config.fbPageId && config.igUserId ? "BOTH" : config.fbPageId ? "FB" : "IG";
      const snapshot = await fetchSocialReportSnapshot(
        config,
        from,
        to,
        platform,
        boostedMap
      );
      const payload = buildServerSocialReportPayload(
        snapshot,
        boostedMap,
        config,
        from,
        to,
        platform
      );
      social = compactSocialPayload(payload);
    } catch (err) {
      errors.push(`Social: ${cleanError(err)}`);
      social = { status: "error", reason: cleanError(err) };
    }
  }

  if (mode === "performance") {
    social = { status: "skipped", reason: "Manual email requested performance only" };
  }

  if (config.igResolveError) {
    errors.push(`Instagram resolve: ${config.igResolveError}`);
  }

  return {
    clientKey: config.clientKey,
    clientName: config.clientName,
    performance,
    social,
    errors,
  };
}

function buildDigestPrompt(
  range: { from: string; to: string },
  clients: ClientDigestInput[],
  mode: DigestMode
) {
  return `You are Bludash's senior creative performance strategist.

Operations needs a concise internal digest of the least-working creatives for each client in the requested scope.
Requested scope: ${mode}.

When scope is "both", analyze:
1. Performance marketing ads
2. Social media content

Use ONLY the candidate metrics below. Do not invent spend, leads, CPL, reach, engagement, dates, names, categories, or links.
For each client, review the performance.categories array category-by-category. The candidates are pre-scored from the active ads/posts in the selected period.
For performance, never compare all campaign objectives with one shared KPI. Pick weak creatives inside their own category:
- Awareness / Reach: judge reach, impressions, CPM, and engagement quality. Do not penalize zero leads, missing CPL, or low CTR unless the category explicitly depends on clicks.
- Lead generation: judge leads, CPL, spend, CTR, CPC, and traffic quality. Zero leads after meaningful spend is a red flag here.
- Traffic / Clicks: judge clicks, CTR, CPC, and landing page views.
- Engagement / Messages: judge post engagements, engagement rate, likes, comments, shares, and message intent.
- Video views: judge video views, hook rate, skip rate, hold rate, and watch time.
Return 1-2 weakest creatives per category when that category has a materially weak candidate; return 2-5 total performance flags when multiple categories need attention. If more creatives are materially weak, list them in additionalFlags with their category.
For social, return the 2-3 weakest posts/reels when available. If more posts are materially weak, list them in additionalFlags.
Explain each reason using exact metrics, then give a better action plan that can be executed in the next 48 hours.

Return one valid JSON object only. No markdown.

JSON shape:
{
  "range": { "from": "${range.from}", "to": "${range.to}" },
  "executiveSummary": ["3-5 short cross-client findings"],
  "clients": [
    {
      "clientKey": "",
      "clientName": "",
      "performance": {
        "status": "analyzed|no_data|skipped|error",
        "flaggedCreatives": [
          {
          "id": "",
          "name": "",
          "campaign": "",
          "category": "Awareness / Reach|Lead generation|Traffic / Clicks|Engagement / Messages|Video views|Sales / Conversion|Other",
          "evidence": ["exact metric proof"],
          "reasoning": "2-4 sentences grounded in the metrics",
          "actionPlan": ["3-5 specific actions for replacement/fix"],
          "priority": "Critical|High|Medium|Low"
          }
        ],
        "additionalFlags": ["short names of other materially weak creatives, if any"]
      },
      "social": {
        "status": "analyzed|no_data|skipped|error",
        "flaggedCreatives": [
          {
          "id": "",
          "caption": "",
          "platform": "FB|IG",
          "permalink": "",
          "evidence": ["exact metric proof"],
          "reasoning": "2-4 sentences grounded in the metrics",
          "actionPlan": ["3-5 specific actions for replacement/fix"],
          "priority": "Critical|High|Medium|Low"
          }
        ],
        "additionalFlags": ["short names/captions of other materially weak posts, if any"]
      },
      "notes": ["config or data caveats only when relevant"]
    }
  ]
}

CLIENT CANDIDATES:
${JSON.stringify({ range, clients }, null, 2)}`;
}

async function buildDigestAnalysis(
  range: { from: string; to: string },
  clients: ClientDigestInput[],
  mode: DigestMode
) {
  const raw = await createOpenAIResponse({
    input: [
      {
        role: "developer",
        content:
          "You are an expert Meta ads and social media creative analyst. Return strict JSON only.",
      },
      {
        role: "user",
        content: buildDigestPrompt(range, clients, mode),
      },
    ],
    reasoning: { effort: getOpenAIReportReasoningEffort() },
    text: { format: { type: "json_object" }, verbosity: "medium" },
    max_output_tokens: 14000,
  });

  return extractJSONFromText(raw);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function escapeHtml(value: unknown) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function listHtml(items: unknown[]) {
  if (items.length === 0) return "<li>No specific item returned.</li>";
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function flaggedCreatives(section: Record<string, unknown>) {
  const flagged = asArray(section.flaggedCreatives).map(asRecord);
  if (flagged.length > 0) return flagged;

  const legacy = asRecord(section.leastWorkingCreative);
  return Object.keys(legacy).length > 0 ? [legacy] : [];
}

function renderCreativeBlock(kind: "Performance" | "Social", value: unknown) {
  const section = asRecord(value);
  const status = text(section.status, "unknown");
  const creatives = flaggedCreatives(section);
  const additionalFlags = asArray(section.additionalFlags).map((item) => text(item)).filter(Boolean);

  if (status !== "analyzed") {
    return `<div class="block muted"><h4>${kind}</h4><p>${escapeHtml(status)}${section.reason ? `: ${escapeHtml(section.reason)}` : ""}</p></div>`;
  }

  const creativeHtml = creatives
    .slice(0, 5)
    .map((creative, index) => {
      const title =
        kind === "Performance"
          ? text(creative.name, "Unnamed creative")
          : text(creative.caption, "Unnamed post");
      const metaParts = [
        kind === "Performance" ? text(creative.category || creative.categoryLabel) : text(creative.platform),
        text(creative.campaign),
      ].filter(Boolean);

      return `
        <div class="creative-item">
          <div class="block-head">
            <h5>#${index + 1} ${escapeHtml(title)}</h5>
            <span>${escapeHtml(creative.priority || "Priority")}</span>
          </div>
          ${metaParts.length ? `<p class="meta">${metaParts.map(escapeHtml).join(" - ")}</p>` : ""}
          ${kind === "Social" && creative.permalink ? `<p class="meta">${escapeHtml(creative.permalink)}</p>` : ""}
          <p>${escapeHtml(creative.reasoning)}</p>
          <div class="cols">
            <div><strong>Evidence</strong><ul>${listHtml(asArray(creative.evidence))}</ul></div>
            <div><strong>Action plan</strong><ul>${listHtml(asArray(creative.actionPlan))}</ul></div>
          </div>
        </div>`;
    })
    .join("");

  return `
    <div class="block">
      <h4>${kind}</h4>
      ${creativeHtml || "<p>No weak creative was returned.</p>"}
      ${additionalFlags.length > 0 ? `<div class="more-flags"><strong>More weak flags</strong><ul>${listHtml(additionalFlags)}</ul></div>` : ""}
    </div>`;
}

function renderDigestHtml(params: {
  analysis: unknown;
  range: { from: string; to: string };
  model: string;
  generatedAt: string;
}) {
  const analysis = asRecord(params.analysis);
  const clients = asArray(analysis.clients).map(asRecord);
  const summary = asArray(analysis.executiveSummary);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; background: #f6f7fb; color: #111827; font-family: Arial, sans-serif; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 28px; }
    .hero { background: #101828; color: white; padding: 24px; border-radius: 8px; }
    .hero p { color: #cbd5e1; margin: 8px 0 0; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 18px; padding: 20px; }
    h1, h2, h3, h4, h5 { margin: 0; }
    h1 { font-size: 24px; }
    h2 { font-size: 18px; margin-bottom: 10px; }
    h3 { font-size: 17px; }
    h4 { font-size: 13px; color: #475467; text-transform: uppercase; letter-spacing: .04em; }
    h5 { font-size: 16px; margin: 0; }
    p { line-height: 1.5; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    li { margin: 4px 0; line-height: 1.45; }
    .summary li { font-weight: 600; }
    .client { border-top: 4px solid #2563eb; }
    .blocks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .block { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; background: #fcfcfd; }
    .block.muted { color: #667085; }
    .block-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .block-head span { background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .creative-item { border-top: 1px solid #e5e7eb; margin-top: 12px; padding-top: 12px; }
    .creative-item:first-of-type { border-top: 0; margin-top: 10px; padding-top: 0; }
    .meta { color: #667085; font-size: 12px; margin: 6px 0; word-break: break-word; }
    .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    .more-flags { border-top: 1px solid #e5e7eb; margin-top: 12px; padding-top: 12px; }
    .notes { color: #667085; font-size: 12px; }
    @media (max-width: 720px) {
      .blocks, .cols { grid-template-columns: 1fr; }
      .wrap { padding: 14px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>Bludash 48-hour creative digest</h1>
      <p>${escapeHtml(params.range.from)} to ${escapeHtml(params.range.to)} - generated ${escapeHtml(params.generatedAt)} - model ${escapeHtml(params.model)}</p>
    </div>
    <div class="card summary">
      <h2>Executive Summary</h2>
      <ul>${listHtml(summary)}</ul>
    </div>
    ${clients
      .map((client) => {
        const notes = asArray(client.notes);
        return `<div class="card client">
          <h3>${escapeHtml(client.clientName || client.clientKey)}</h3>
          <div class="blocks">
            ${renderCreativeBlock("Performance", client.performance)}
            ${renderCreativeBlock("Social", client.social)}
          </div>
          ${notes.length ? `<p class="notes"><strong>Notes:</strong> ${notes.map(escapeHtml).join("; ")}</p>` : ""}
        </div>`;
      })
      .join("")}
  </div>
</body>
</html>`;
}

function renderDigestText(params: {
  analysis: unknown;
  range: { from: string; to: string };
  model: string;
  generatedAt: string;
}) {
  const analysis = asRecord(params.analysis);
  const lines = [
    `Bludash 48-hour creative digest`,
    `${params.range.from} to ${params.range.to}`,
    `Generated: ${params.generatedAt}`,
    `Model: ${params.model}`,
    "",
    "Executive summary:",
    ...asArray(analysis.executiveSummary).map((item) => `- ${text(item)}`),
    "",
  ];

  for (const rawClient of asArray(analysis.clients)) {
    const client = asRecord(rawClient);
    lines.push(text(client.clientName || client.clientKey, "Client"));

    for (const key of ["performance", "social"]) {
      const block = asRecord(client[key]);
      const creatives = flaggedCreatives(block);
      const additionalFlags = asArray(block.additionalFlags).map((item) => text(item)).filter(Boolean);
      lines.push(`  ${key}: ${text(block.status)}`);
      if (text(block.status) === "analyzed") {
        creatives.slice(0, 5).forEach((creative, index) => {
          lines.push(`  #${index + 1}: ${text(creative.name || creative.caption)}`);
          if (creative.category || creative.categoryLabel) {
            lines.push(`  Category: ${text(creative.category || creative.categoryLabel)}`);
          }
          lines.push(`  Priority: ${text(creative.priority)}`);
          lines.push(`  Reason: ${text(creative.reasoning)}`);
          lines.push(`  Evidence: ${asArray(creative.evidence).map((item) => text(item)).join(" | ")}`);
          lines.push(`  Action plan: ${asArray(creative.actionPlan).map((item) => text(item)).join(" | ")}`);
        });
        if (additionalFlags.length) {
          lines.push(`  More weak flags: ${additionalFlags.join(" | ")}`);
        }
      } else if (block.reason) {
        lines.push(`  Reason: ${text(block.reason)}`);
      }
    }

    const notes = asArray(client.notes).map((item) => text(item)).filter(Boolean);
    if (notes.length) lines.push(`  Notes: ${notes.join("; ")}`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function runCreativeDigest(options: DigestOptions = {}) {
  const defaultRange = getDefaultCreativeDigestRange();
  const range = {
    from: options.from || defaultRange.from,
    to: options.to || defaultRange.to,
  };
  const mode = options.mode || "both";
  const clientKeys = getDigestClientKeys(options.clientKeys);
  const concurrency = Math.max(1, Number(process.env.CREATIVE_DIGEST_CONCURRENCY || "2") || 2);
  const clientInputs = await mapWithConcurrency(
    clientKeys,
    concurrency,
    (clientKey) => buildClientDigestInput(clientKey, range.from, range.to, mode)
  );
  const analysis = await buildDigestAnalysis(range, clientInputs, mode);
  const generatedAt = new Date().toISOString();
  const model = getOpenAIReportModel();
  const html = renderDigestHtml({ analysis, range, model, generatedAt });
  const textBody = renderDigestText({ analysis, range, model, generatedAt });
  const recipient = options.recipient || process.env.CREATIVE_DIGEST_EMAIL_TO || DEFAULT_TO;
  const modeLabel = mode === "both" ? "creative" : mode;
  const clientLabel = clientInputs.length === 1 ? ` - ${clientInputs[0].clientName}` : "";
  const subject = `Bludash ${modeLabel} digest${clientLabel} (${range.from} to ${range.to})`;
  let email: unknown = null;

  if (!options.dryRun) {
    email = await sendMail({
      to: recipient,
      subject,
      html,
      text: textBody,
    });
  }

  return {
    ok: true,
    dryRun: Boolean(options.dryRun),
    emailed: !options.dryRun,
    recipient,
    subject,
    range,
    mode,
    model,
    clientCount: clientInputs.length,
    clientsWithErrors: clientInputs.filter((client) => client.errors.length > 0).length,
    email,
    analysis,
    clientInputs,
  };
}
