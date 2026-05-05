// lib/buildReportPayload.ts
// Crunches raw ad data into a deeply pre-analyzed payload.
// Manus receives this — it never needs to fetch, calculate, or format.
// All heavy lifting is done here so Manus only writes insights.

import type { Ad, AdInsight, Campaign } from "@/components/dashboard/useAdsPerformance";

// ─── Industry benchmarks for Meta Ads (India market) ─────────────────────────
const BENCHMARKS = {
  ctr: { good: 1.5, ok: 0.8, unit: "%" },
  cpc: { good: 5, ok: 15, unit: "₹" },
  cpm: { good: 50, ok: 120, unit: "₹" },
  cpl: { good: 100, ok: 300, unit: "₹" },
  // engagement rate = (likes+comments+shares) / reach * 100
  engagementRate: { good: 3, ok: 1, unit: "%" },
  // video view rate = videoViews / impressions * 100
  videoViewRate: { good: 15, ok: 8, unit: "%" },
};

function flag(value: number, bench: { good: number; ok: number }, lowerIsBetter = false) {
  if (lowerIsBetter) {
    if (value <= bench.good) return "good";
    if (value <= bench.ok) return "warn";
    return "bad";
  }
  if (value >= bench.good) return "good";
  if (value >= bench.ok) return "warn";
  return "bad";
}

function pct(a: number, b: number) {
  if (!b) return 0;
  return +((a / b) * 100).toFixed(2);
}

function round(n: number, d = 2) {
  return +n.toFixed(d);
}

function topN<T>(arr: T[], key: (x: T) => number, n = 3, asc = false): T[] {
  return [...arr]
    .sort((a, b) => (asc ? key(a) - key(b) : key(b) - key(a)))
    .slice(0, n);
}

export interface AnalyzedAd {
  id: string;
  name: string;
  campaign: string;
  adSet: string;
  status: string;
  isVideo: boolean;
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  ctrFlag: "good" | "warn" | "bad";
  cpm: number;
  cpmFlag: "good" | "warn" | "bad";
  cpc: number;
  cpcFlag: "good" | "warn" | "bad";
  leads: number;
  cpl: number;
  cplFlag: "good" | "warn" | "bad";
  likes: number;
  comments: number;
  shares: number;
  videoViews: number;
  landingPageViews: number;
  postEngagements: number;
  engagementRate: number;
  engagementRateFlag: "good" | "warn" | "bad";
  videoViewRate: number;
  videoViewRateFlag: "good" | "warn" | "bad";
  spendShare: number; // % of total spend this ad consumes
  reachShare: number;
  leadsShare: number;
}

export interface CampaignSummary {
  id: string;
  name: string;
  objective: string;
  status: string;
  adSetCount: number;
  adCount: number;
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  leads: number;
  cpl: number;
  spendShare: number;
  leadsShare: number;
}

export interface ReportPayload {
  meta: {
    client: string;
    from: string;
    to: string;
    generatedAt: string;
    currency: string;
  };
  summary: {
    totalSpend: number;
    totalReach: number;
    totalImpressions: number;
    totalClicks: number;
    totalLeads: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalVideoViews: number;
    totalLandingPageViews: number;
    totalPostEngagements: number;
    overallCTR: number;
    overallCTRFlag: string;
    overallCPM: number;
    overallCPMFlag: string;
    overallCPC: number;
    overallCPCFlag: string;
    overallCPL: number;
    overallCPLFlag: string;
    totalAds: number;
    activeAds: number;
    pausedAds: number;
    videoAds: number;
    imageAds: number;
    campaignCount: number;
    adSetCount: number;
    avgCTR: number;
    avgCPM: number;
    avgCPC: number;
    avgCPL: number;
  };
  benchmarks: typeof BENCHMARKS;
  campaigns: CampaignSummary[];
  ads: AnalyzedAd[];
  rankings: {
    topSpend: AnalyzedAd[];
    topReach: AnalyzedAd[];
    topLeads: AnalyzedAd[];
    bestCTR: AnalyzedAd[];
    worstCTR: AnalyzedAd[];
    bestCPC: AnalyzedAd[];
    worstCPC: AnalyzedAd[];
    bestCPL: AnalyzedAd[];
    worstCPL: AnalyzedAd[];
    topVideoViews: AnalyzedAd[];
    highSpendLowReturn: AnalyzedAd[]; // high spend, zero/low leads
    bestEngagement: AnalyzedAd[];
  };
  redFlags: Array<{
    adId: string;
    adName: string;
    issue: string;
    severity: "critical" | "high" | "medium";
    data: string;
  }>;
  positives: Array<{
    adId: string;
    adName: string;
    highlight: string;
    data: string;
  }>;
  spendConcentration: {
    top3AdsSpendPct: number; // % of total spend in top 3 ads
    top3AdsLeadsPct: number;
    isConcentrated: boolean;
  };
}

export function buildReportPayload(
  allAds: Ad[],
  campaigns: Campaign[],
  client: string,
  from: string,
  to: string,
  accountInsight: AdInsight | null = null
): ReportPayload {
  // ── Totals ────────────────────────────────────────────────────────────────
  const summedSpend       = allAds.reduce((s, a) => s + a.insights.spend, 0);
  const summedReach       = allAds.reduce((s, a) => s + a.insights.reach, 0);
  const summedImpressions = allAds.reduce((s, a) => s + a.insights.impressions, 0);
  const summedClicks      = allAds.reduce((s, a) => s + a.insights.clicks, 0);
  const summedLeads       = allAds.reduce((s, a) => s + a.insights.leads, 0);
  const summedLikes       = allAds.reduce((s, a) => s + a.insights.likes, 0);
  const summedComments    = allAds.reduce((s, a) => s + a.insights.comments, 0);
  const summedShares      = allAds.reduce((s, a) => s + a.insights.shares, 0);
  const summedVideoViews  = allAds.reduce((s, a) => s + a.insights.videoViews, 0);
  const summedLPViews     = allAds.reduce((s, a) => s + a.insights.landingPageViews, 0);
  const summedEngagements = allAds.reduce((s, a) => s + a.insights.postEngagements, 0);

  const totalSpend       = accountInsight?.spend ?? summedSpend;
  const totalReach       = accountInsight?.reach ?? summedReach;
  const totalImpressions = accountInsight?.impressions ?? summedImpressions;
  const totalClicks      = accountInsight?.clicks ?? summedClicks;
  const totalLeads       = accountInsight?.leads ?? summedLeads;
  const totalLikes       = accountInsight?.likes ?? summedLikes;
  const totalComments    = accountInsight?.comments ?? summedComments;
  const totalShares      = accountInsight?.shares ?? summedShares;
  const totalVideoViews  = accountInsight?.videoViews ?? summedVideoViews;
  const totalLPViews     = accountInsight?.landingPageViews ?? summedLPViews;
  const totalEngagements = accountInsight?.postEngagements ?? summedEngagements;

  const overallCTR = accountInsight?.ctr != null ? round(accountInsight.ctr) : pct(totalClicks, totalImpressions);
  const overallCPM = accountInsight?.cpm != null ? round(accountInsight.cpm) : totalImpressions > 0 ? round((totalSpend / totalImpressions) * 1000) : 0;
  const overallCPC = accountInsight?.cpc != null ? round(accountInsight.cpc) : totalClicks > 0 ? round(totalSpend / totalClicks) : 0;
  const overallCPL = totalLeads > 0 ? round(totalSpend / totalLeads) : 0;

  // ── Per-ad analysis ───────────────────────────────────────────────────────
  const analyzedAds: AnalyzedAd[] = allAds.map((ad) => {
    const ins = ad.insights;
    const engagementRate = pct(ins.likes + ins.comments + ins.shares, ins.reach);
    const videoViewRate  = ad.isVideo ? pct(ins.videoViews, ins.impressions) : 0;

    return {
      id: ad.id,
      name: ad.name,
      campaign: ad.campaignName,
      adSet: ad.adSetName,
      status: ad.status,
      isVideo: ad.isVideo,
      spend: round(ins.spend),
      reach: ins.reach,
      impressions: ins.impressions,
      clicks: ins.clicks,
      ctr: round(ins.ctr),
      ctrFlag: flag(ins.ctr, BENCHMARKS.ctr),
      cpm: round(ins.cpm),
      cpmFlag: flag(ins.cpm, BENCHMARKS.cpm, true),
      cpc: round(ins.cpc),
      cpcFlag: ins.cpc > 0 ? flag(ins.cpc, BENCHMARKS.cpc, true) : "warn",
      leads: ins.leads,
      cpl: round(ins.cpl),
      cplFlag: ins.cpl > 0 ? flag(ins.cpl, BENCHMARKS.cpl, true) : "warn",
      likes: ins.likes,
      comments: ins.comments,
      shares: ins.shares,
      videoViews: ins.videoViews,
      landingPageViews: ins.landingPageViews,
      postEngagements: ins.postEngagements,
      engagementRate: round(engagementRate),
      engagementRateFlag: flag(engagementRate, BENCHMARKS.engagementRate),
      videoViewRate: round(videoViewRate),
      videoViewRateFlag: flag(videoViewRate, BENCHMARKS.videoViewRate),
      spendShare: round(pct(ins.spend, totalSpend)),
      reachShare: round(pct(ins.reach, totalReach)),
      leadsShare: round(pct(ins.leads, totalLeads)),
    };
  });

  // ── Campaign summaries ────────────────────────────────────────────────────
  const campaignSummaries: CampaignSummary[] = campaigns.map((c) => {
    const cAds = c.adSets.flatMap((s) => s.ads);
    const cSpend = cAds.reduce((s, a) => s + a.insights.spend, 0);
    const cReach = cAds.reduce((s, a) => s + a.insights.reach, 0);
    const cImpr  = cAds.reduce((s, a) => s + a.insights.impressions, 0);
    const cClks  = cAds.reduce((s, a) => s + a.insights.clicks, 0);
    const cLeads = cAds.reduce((s, a) => s + a.insights.leads, 0);
    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      adSetCount: c.adSets.length,
      adCount: cAds.length,
      spend: round(cSpend),
      reach: cReach,
      impressions: cImpr,
      clicks: cClks,
      ctr: round(pct(cClks, cImpr)),
      cpm: cImpr > 0 ? round((cSpend / cImpr) * 1000) : 0,
      cpc: cClks > 0 ? round(cSpend / cClks) : 0,
      leads: cLeads,
      cpl: cLeads > 0 ? round(cSpend / cLeads) : 0,
      spendShare: round(pct(cSpend, totalSpend)),
      leadsShare: round(pct(cLeads, totalLeads)),
    };
  });

  // ── Rankings ──────────────────────────────────────────────────────────────
  const adsWithLeads   = analyzedAds.filter((a) => a.leads > 0);
  const adsWithSpend   = analyzedAds.filter((a) => a.spend > 0);
  const adsWithCPC     = analyzedAds.filter((a) => a.cpc > 0);
  const videoAds       = analyzedAds.filter((a) => a.isVideo && a.impressions > 0);
  const highSpendNoLead = adsWithSpend
    .filter((a) => a.leads === 0 && a.spendShare > 5) // eating 5%+ budget with 0 leads
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  const top3Ads = topN(adsWithSpend, (a) => a.spend, 3);
  const top3Spend = top3Ads.reduce((s, a) => s + a.spend, 0);
  const top3Leads = top3Ads.reduce((s, a) => s + a.leads, 0);

  // ── Red flags ─────────────────────────────────────────────────────────────
  const redFlags: ReportPayload["redFlags"] = [];

  for (const ad of analyzedAds) {
    // Critical: high spend, zero leads, campaign objective is leads
    if (ad.spend > 500 && ad.leads === 0) {
      const camp = campaigns.find((c) => c.name === ad.campaign);
      const obj = camp?.objective?.toLowerCase() ?? "";
      if (obj.includes("lead") || obj.includes("outcome_leads")) {
        redFlags.push({
          adId: ad.id,
          adName: ad.name,
          issue: "High spend with zero leads on a Lead Generation campaign",
          severity: "critical",
          data: `Spend: ₹${ad.spend}, Leads: 0, Campaign: ${ad.campaign}`,
        });
      }
    }

    // Critical: CTR below 0.3% with significant spend
    if (ad.ctr < 0.3 && ad.spend > 200) {
      redFlags.push({
        adId: ad.id,
        adName: ad.name,
        issue: "Critically low CTR — creative or audience mismatch",
        severity: "critical",
        data: `CTR: ${ad.ctr}% (benchmark: ≥${BENCHMARKS.ctr.ok}%), Spend: ₹${ad.spend}`,
      });
    }

    // High: CPL more than 3x benchmark
    if (ad.cpl > BENCHMARKS.cpl.ok * 3 && ad.leads > 0) {
      redFlags.push({
        adId: ad.id,
        adName: ad.name,
        issue: "CPL is critically high — 3x above acceptable threshold",
        severity: "high",
        data: `CPL: ₹${ad.cpl} (good: <₹${BENCHMARKS.cpl.good}, ok: <₹${BENCHMARKS.cpl.ok})`,
      });
    }

    // High: CPM very high
    if (ad.cpm > BENCHMARKS.cpm.ok * 2 && ad.spend > 100) {
      redFlags.push({
        adId: ad.id,
        adName: ad.name,
        issue: "CPM is extremely high — audience may be too narrow or competitive",
        severity: "high",
        data: `CPM: ₹${ad.cpm} (good: <₹${BENCHMARKS.cpm.good})`,
      });
    }

    // Medium: video ad with very low view rate
    if (ad.isVideo && ad.videoViewRate < 5 && ad.impressions > 1000) {
      redFlags.push({
        adId: ad.id,
        adName: ad.name,
        issue: "Video ad with very low view rate — hook/thumbnail not working",
        severity: "medium",
        data: `View rate: ${ad.videoViewRate}% (good: ≥${BENCHMARKS.videoViewRate.good}%)`,
      });
    }

    // Medium: high CPC
    if (ad.cpc > BENCHMARKS.cpc.ok && ad.spend > 100) {
      redFlags.push({
        adId: ad.id,
        adName: ad.name,
        issue: "High CPC — landing page or ad relevance needs improvement",
        severity: "medium",
        data: `CPC: ₹${ad.cpc} (good: <₹${BENCHMARKS.cpc.good})`,
      });
    }
  }

  // ── Positives ─────────────────────────────────────────────────────────────
  const positives: ReportPayload["positives"] = [];

  for (const ad of analyzedAds) {
    if (ad.ctrFlag === "good" && ad.spend > 100) {
      positives.push({
        adId: ad.id,
        adName: ad.name,
        highlight: "Strong CTR — creative is resonating well with the audience",
        data: `CTR: ${ad.ctr}% (benchmark good: ≥${BENCHMARKS.ctr.good}%)`,
      });
    }
    if (ad.cplFlag === "good" && ad.leads > 0) {
      positives.push({
        adId: ad.id,
        adName: ad.name,
        highlight: "Excellent CPL — highly efficient lead generation",
        data: `CPL: ₹${ad.cpl}, Leads: ${ad.leads} (good CPL: <₹${BENCHMARKS.cpl.good})`,
      });
    }
    if (ad.engagementRateFlag === "good" && ad.reach > 500) {
      positives.push({
        adId: ad.id,
        adName: ad.name,
        highlight: "High engagement rate — strong audience-content fit",
        data: `Engagement rate: ${ad.engagementRate}% (good: ≥${BENCHMARKS.engagementRate.good}%)`,
      });
    }
    if (ad.isVideo && ad.videoViewRateFlag === "good") {
      positives.push({
        adId: ad.id,
        adName: ad.name,
        highlight: "Video hook is working — high percentage of impressions converting to views",
        data: `Video view rate: ${ad.videoViewRate}% (good: ≥${BENCHMARKS.videoViewRate.good}%)`,
      });
    }
  }

  // ── Average metrics ───────────────────────────────────────────────────────
  const adsN = analyzedAds.length || 1;
  const avgCTR = round(analyzedAds.reduce((s, a) => s + a.ctr, 0) / adsN);
  const avgCPM = round(analyzedAds.reduce((s, a) => s + a.cpm, 0) / adsN);
  const avgCPC = round(adsWithCPC.reduce((s, a) => s + a.cpc, 0) / (adsWithCPC.length || 1));
  const avgCPL = round(adsWithLeads.reduce((s, a) => s + a.cpl, 0) / (adsWithLeads.length || 1));

  return {
    meta: {
      client,
      from,
      to,
      generatedAt: new Date().toISOString(),
      currency: "INR",
    },
    summary: {
      totalSpend: round(totalSpend),
      totalReach,
      totalImpressions,
      totalClicks,
      totalLeads,
      totalLikes,
      totalComments,
      totalShares,
      totalVideoViews,
      totalLandingPageViews: totalLPViews,
      totalPostEngagements: totalEngagements,
      overallCTR,
      overallCTRFlag: flag(overallCTR, BENCHMARKS.ctr),
      overallCPM,
      overallCPMFlag: flag(overallCPM, BENCHMARKS.cpm, true),
      overallCPC,
      overallCPCFlag: overallCPC > 0 ? flag(overallCPC, BENCHMARKS.cpc, true) : "warn",
      overallCPL,
      overallCPLFlag: overallCPL > 0 ? flag(overallCPL, BENCHMARKS.cpl, true) : "warn",
      totalAds: allAds.length,
      activeAds: allAds.filter((a) => a.status === "ACTIVE").length,
      pausedAds: allAds.filter((a) => a.status === "PAUSED").length,
      videoAds: allAds.filter((a) => a.isVideo).length,
      imageAds: allAds.filter((a) => !a.isVideo).length,
      campaignCount: campaigns.length,
      adSetCount: campaigns.reduce((s, c) => s + c.adSets.length, 0),
      avgCTR,
      avgCPM,
      avgCPC,
      avgCPL,
    },
    benchmarks: BENCHMARKS,
    campaigns: campaignSummaries,
    ads: analyzedAds,
    rankings: {
      topSpend: topN(analyzedAds, (a) => a.spend, 5),
      topReach: topN(analyzedAds, (a) => a.reach, 5),
      topLeads: topN(adsWithLeads, (a) => a.leads, 5),
      bestCTR: topN(adsWithSpend, (a) => a.ctr, 5),
      worstCTR: topN(adsWithSpend.filter((a) => a.impressions > 500), (a) => a.ctr, 5, true),
      bestCPC: topN(adsWithCPC, (a) => a.cpc, 5, true),
      worstCPC: topN(adsWithCPC, (a) => a.cpc, 5),
      bestCPL: topN(adsWithLeads, (a) => a.cpl, 5, true),
      worstCPL: topN(adsWithLeads, (a) => a.cpl, 5),
      topVideoViews: topN(videoAds, (a) => a.videoViews, 5),
      highSpendLowReturn: highSpendNoLead,
      bestEngagement: topN(adsWithSpend.filter((a) => a.reach > 200), (a) => a.engagementRate, 5),
    },
    redFlags,
    positives,
    spendConcentration: {
      top3AdsSpendPct: round(pct(top3Spend, totalSpend)),
      top3AdsLeadsPct: round(pct(top3Leads, totalLeads)),
      isConcentrated: pct(top3Spend, totalSpend) > 60,
    },
  };
}
