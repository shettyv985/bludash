import { NextRequest, NextResponse } from "next/server";
import type { ReportPayload } from "@/lib/buildReportPayload";
import {
  createOpenAIResponse,
  extractJSONFromText,
  getOpenAIReportModel,
  getOpenAIReportReasoningEffort,
} from "@/lib/openaiResponses";

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

function compactAd(ad: ReportPayload["ads"][number]) {
  return {
    name: ad.name,
    campaign: ad.campaign,
    adSet: ad.adSet,
    status: ad.status,
    spend: ad.spend,
    reach: ad.reach,
    impressions: ad.impressions,
    clicks: ad.clicks,
    ctr: ad.ctr,
    cpm: ad.cpm,
    cpc: ad.cpc,
    leads: ad.leads,
    cpl: ad.cpl,
    likes: ad.likes,
    comments: ad.comments,
    shares: ad.shares,
    videoViews: ad.videoViews,
    hookRate: ad.hookRate,
    skipRate: ad.skipRate,
    avgWatchTime: ad.avgWatchTime,
    holdRate50: ad.holdRate50,
    completionRate: ad.completionRate,
    spendShare: ad.spendShare,
    leadsShare: ad.leadsShare,
    engagementRate: ad.engagementRate,
  };
}

function uniqueAds(ads: ReportPayload["ads"]) {
  const seen = new Set<string>();
  const result: ReturnType<typeof compactAd>[] = [];

  for (const ad of ads) {
    const key = ad.id || `${ad.name}:${ad.campaign}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(compactAd(ad));
  }

  return result;
}

function compactRanking(ranking: ReportPayload["rankings"][keyof ReportPayload["rankings"]]) {
  return ranking.slice(0, 5).map(compactAd);
}

function compactPayload(payload: ReportPayload) {
  const rankingAds = Object.values(payload.rankings).flatMap((ranking) => ranking.slice(0, 8));
  const spendLeadsAds = [...payload.ads]
    .sort((a, b) => b.spend + b.leads * 250 - (a.spend + a.leads * 250))
    .slice(0, 60);

  return {
    meta: payload.meta,
    summary: payload.summary,
    benchmarks: payload.benchmarks,
    campaigns: payload.campaigns,
    redFlags: payload.redFlags,
    positives: payload.positives,
    spendConcentration: payload.spendConcentration,
    rankings: Object.fromEntries(
      Object.entries(payload.rankings).map(([key, ranking]) => [key, compactRanking(ranking)])
    ),
    focusAds: uniqueAds([...rankingAds, ...spendLeadsAds]).slice(0, 90),
    fullAdCount: payload.ads.length,
  };
}

function buildPrompt(payload: ReportPayload): string {
  return `You are Bludash's senior Meta Ads strategist. Produce a premium, brutally specific performance diagnosis for a paying client.

Return one valid JSON object only. No markdown, no prose outside JSON.

Accuracy rules:
- Use ONLY the numbers in the payload.
- Do not invent leads, spend, CTR, CPL, dates, ad names, campaign names, benchmarks, or recommendations.
- Reference exact ad/campaign/ad set names and exact metrics in every important claim.
- Separate facts from inference. When you infer a cause, anchor it to a metric such as CTR, CPL, CPM, hook rate, hold rate, skip rate, spend share, lead share, or engagement.
- If data is missing, say what is missing and give a conservative recommendation.
- Rank priorities by business impact: wasted spend, lead efficiency, creative fatigue, weak hook, audience mismatch, then scaling opportunities.

Depth rules:
- Explain why winners worked: hook, offer, audience-message fit, format, emotional trigger, CTA, or budget distribution.
- Explain why losers failed: weak hook, poor message clarity, wrong audience, offer mismatch, ad fatigue, landing-page friction, or budget misallocation.
- For video/Reel ads, use views, hook rate, skip rate, average watch time, 50% hold rate, completion rate, CTR, CPM, CPL, and leads wherever available.
- Every recommendation must be executable tomorrow with expected metric movement.

Report writing rules:
- Keep the report concise and boardroom-ready. No essay paragraphs.
- overallHealthScore.score must be 1-100.
- Every string should be 12-35 words where possible. executiveSummary can be up to 5 short sentences.
- Key takeaways must be short metric-backed bullets, not long explanations.
- prioritizedActions, thirtyDayPlan, and quickWins must be arrays of objects, never arrays of strings.
- Each action object must clearly answer: what happened, why it happened, what to fix, and why that fix should improve metrics.

Return this JSON shape with all top-level keys:
{
  "overallHealthScore": { "score": 50, "label": "Poor|Below Average|Average|Good|Excellent", "reasoning": "" },
  "executiveSummary": "",
  "keyTakeaways": [],
  "accountDiagnosis": {
    "biggestProblem": "",
    "biggestOpportunity": "",
    "spendEfficiencyScore": "",
    "creativeHealthScore": ""
  },
  "whatIsWorking": [
    { "point": "", "whyItWorks": "", "evidence": "", "recommendation": "", "scalingPotential": "High|Medium|Low" }
  ],
  "whatIsNotWorking": [
    { "point": "", "whyItFails": "", "evidence": "", "recommendation": "", "verdict": "Pause Immediately|Needs Creative Fix|Needs Audience Fix|Needs Budget Reallocation" }
  ],
  "creativeDeepDive": {
    "topPerformer": { "adName": "", "whyItWorks": "", "keyMetrics": "", "whatToReplicate": "" },
    "worstPerformer": { "adName": "", "whyItFails": "", "keyMetrics": "", "whatToChange": "" },
    "creativeRankings": [],
    "formatAnalysis": { "videoVsStatic": "", "recommendations": [] }
  },
  "campaignAnalysis": [],
  "adSetAnalysis": [],
  "budgetOptimization": {
    "currentAllocation": "",
    "wastedSpend": "",
    "summary": "",
    "actions": []
  },
  "audienceAndTargeting": {
    "whatTheDataReveals": "",
    "highPerformingAudiences": [],
    "failingAudiences": [],
    "observations": "",
    "recommendations": []
  },
  "leadsAnalysis": {
    "totalLeads": 0,
    "costPerLead": "",
    "leadQualityAssessment": "",
    "bestLeadSource": "",
    "worstLeadSource": "",
    "observations": "",
    "recommendations": []
  },
  "competitiveContext": { "benchmarkComparison": "", "marketObservations": "" },
  "prioritizedActions": [
    { "action": "", "reason": "", "evidence": "", "execution": "", "expectedResult": "", "timeToImpact": "Immediate|This week|This month" }
  ],
  "thirtyDayPlan": [
    { "week": "Week 1", "focus": "", "reason": "", "actions": [], "successMetric": "" }
  ],
  "quickWins": [
    { "action": "", "reason": "", "execution": "", "expectedResult": "" }
  ]
}

COMPACT PRE-CALCULATED PERFORMANCE PAYLOAD:
${JSON.stringify(compactPayload(payload), null, 2)}`;
}

export async function POST(req: NextRequest) {
  let payload: ReportPayload;
  try {
    const body = (await req.json()) as { payload?: ReportPayload };
    if (!body.payload) throw new Error("Missing payload field");
    payload = body.payload;
  } catch (err: unknown) {
    return NextResponse.json({ error: `Invalid request body: ${getErrorMessage(err)}` }, { status: 400 });
  }

  try {
    const raw = await createOpenAIResponse({
      input: [
        {
          role: "developer",
          content:
            "You are an expert Meta Ads analyst. Return rigorous, client-ready JSON analysis only.",
        },
        { role: "user", content: buildPrompt(payload) },
      ],
      reasoning: { effort: getOpenAIReportReasoningEffort() },
      text: { format: { type: "json_object" }, verbosity: "high" },
      max_output_tokens: 16000,
    });

    return NextResponse.json({
      reportData: extractJSONFromText(raw),
      model: getOpenAIReportModel(),
    });
  } catch (err: unknown) {
    console.error("gpt-report unhandled error:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
