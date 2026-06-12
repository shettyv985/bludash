import { NextRequest, NextResponse } from "next/server";
import type { SocialReportPayload } from "@/lib/buildSocialReportPayload";
import { getMetaClientConfig } from "@/lib/metaClientConfig";
import {
  createOpenAIResponse,
  extractJSONFromText,
  getOpenAIReportModel,
  getOpenAIReportReasoningEffort,
} from "@/lib/openaiResponses";

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

function buildPrompt(payload: SocialReportPayload): string {
  const postsForAnalysis = [...payload.posts]
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 40);
  const worstPosts = [...payload.posts]
    .filter((post) => post.totalReach > 50)
    .sort((a, b) => a.engagementRate - b.engagementRate)
    .slice(0, 20);
  const boostedPosts = payload.posts.filter((post) => post.isBoosted);
  const reels = payload.posts.filter((post) => post.type === "REEL");
  const attentionRequired = [...payload.posts]
    .filter((post) => post.totalReach > 100 || post.amountSpent > 0 || post.isBoosted)
    .sort((a, b) => {
      const aRisk = (a.totalReach || 0) * Math.max(0, 3 - (a.engagementRate || 0)) + (a.amountSpent || 0) * 20;
      const bRisk = (b.totalReach || 0) * Math.max(0, 3 - (b.engagementRate || 0)) + (b.amountSpent || 0) * 20;
      return bRisk - aRisk;
    })
    .slice(0, 20);

  return `You are Bludash's senior Facebook and Instagram strategist for Indian brands. Produce a premium social media deep report from the supplied data only.

Return one valid JSON object only. No markdown, no prose outside JSON.

Authoritative account context:
- Client key: ${payload.meta.client}
- Client/account name: ${payload.meta.clientName ?? payload.meta.client}
- Meta ad account ID: ${payload.meta.adAccountId ?? "NOT PROVIDED"}
- Meta ad account name: ${payload.meta.adAccountName ?? payload.meta.clientName ?? payload.meta.client}
- Date range: ${payload.meta.from} to ${payload.meta.to}
- Platform filter: ${payload.meta.platform}

Accuracy rules:
- Use ONLY this payload. Do not browse, fetch, infer another ad account, or invent metrics.
- Reference exact post caption snippets, platform, dates, reach, engagement rate, views, saves, shares, skip rate, hold rate, paid spend, and follower changes wherever relevant.
- Separate organic success from paid-inflated success. If boosted reach is masking weak engagement, say that clearly.
- For Reels, diagnose hook quality using skip rate, held/skipped people, avg watch time, views, and hold rate.
- Each weak post needs a root-cause label such as Weak Hook, Weak Visual, Weak Caption, Wrong Format, Wrong Platform, Spend Mismatch, Low Save Intent, or Creative Fatigue.
- Every recommendation must be an execution instruction for what to post, stop, fix, test, or boost next.

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
    "contentHealthScore": "",
    "audienceGrowthScore": "",
    "rootCause": "",
    "whereTheAccountIsLacking": []
  },
  "periodComparison": {
    "available": false,
    "headline": "",
    "improvements": [],
    "declines": [],
    "stableMetrics": [],
    "trend": "Improving|Declining|Mixed|Stable",
    "keyInsight": ""
  },
  "reelHookAnalysis": {
    "available": false,
    "avgSkipRate": "",
    "avgWatchTime": "",
    "avgHoldRate": "",
    "totalViews": "",
    "hookQualityRating": "Excellent|Good|Moderate|Poor|No Data",
    "bestHook": {},
    "worstHook": {},
    "hookImprovementPlan": ""
  },
  "whatIsWorking": [],
  "whyItWorkedPatterns": [],
  "whatIsNotWorking": [],
  "whyItDidNotWorkPatterns": [],
  "postLevelActionMap": [],
  "contentDeepDive": {
    "topPerformer": {},
    "worstPerformer": {},
    "contentRankings": [],
    "formatAnalysis": {
      "fbBestFormat": "",
      "igBestFormat": "",
      "reelAnalysis": "",
      "carouselAnalysis": "",
      "recommendations": []
    }
  },
  "platformComparison": {
    "fbVsIg": "",
    "audienceBehavior": "",
    "crossPostingOpportunity": "",
    "platformRecommendations": { "fb": "", "ig": "" }
  },
  "boostingAnalysis": {
    "overallAssessment": "",
    "bestBoostedPost": "",
    "worstBoostedPost": "",
    "boostingStrategy": "",
    "recommendations": []
  },
  "audienceGrowth": {
    "fbFollowerAnalysis": "",
    "igFollowerAnalysis": "",
    "growthDrivers": "",
    "churnRisk": "",
    "recommendations": []
  },
  "contentCalendarInsights": {
    "postingFrequency": "",
    "bestPerformingDays": "",
    "contentMixRecommendation": "",
    "captionStrategy": ""
  },
  "prioritizedActions": [
    { "action": "", "reason": "", "evidence": "", "execution": "", "expectedResult": "", "timeToImpact": "Immediate|This week|This month" }
  ],
  "stopStartContinue": { "stop": [], "start": [], "continue": [] },
  "experimentsToRun": [],
  "thirtyDayPlan": [
    { "week": "Week 1", "focus": "", "reason": "", "actions": [], "successMetric": "" }
  ],
  "quickWins": [
    { "action": "", "reason": "", "execution": "", "expectedResult": "" }
  ]
}

SUMMARY AND RANKINGS:
${JSON.stringify({
  meta: payload.meta,
  summary: payload.summary,
  benchmarks: payload.benchmarks,
  rankings: payload.rankings,
  redFlags: payload.redFlags,
  positives: payload.positives,
  contentMix: payload.contentMix,
  comparison: payload.comparison,
}, null, 2)}

TOP POSTS:
${JSON.stringify(postsForAnalysis, null, 2)}

WORST POSTS:
${JSON.stringify(worstPosts, null, 2)}

ATTENTION REQUIRED POSTS:
${JSON.stringify(attentionRequired, null, 2)}

BOOSTED POSTS:
${JSON.stringify(boostedPosts, null, 2)}

REELS:
${JSON.stringify(reels, null, 2)}`;
}

export async function POST(req: NextRequest) {
  let payload: SocialReportPayload;
  try {
    const body = (await req.json()) as { payload?: SocialReportPayload };
    if (!body.payload) throw new Error("Missing payload field");
    payload = body.payload;
  } catch (err: unknown) {
    return NextResponse.json({ error: `Invalid request body: ${getErrorMessage(err)}` }, { status: 400 });
  }

  const config = getMetaClientConfig(payload.meta?.client ?? null);
  if (!config) {
    return NextResponse.json({ error: "Invalid or missing client in report payload" }, { status: 400 });
  }
  if (!config.adAccountId) {
    return NextResponse.json(
      { error: `Missing Meta ad account ID for client ${config.clientKey}` },
      { status: 500 }
    );
  }

  payload = {
    ...payload,
    meta: {
      ...payload.meta,
      client: config.clientKey,
      clientName: config.clientName,
      adAccountId: config.adAccountId,
      adAccountName: config.adAccountName,
    },
  };

  try {
    const raw = await createOpenAIResponse({
      input: [
        {
          role: "developer",
          content:
            "You are an expert social media strategist. Return rigorous, client-ready JSON analysis only.",
        },
        { role: "user", content: buildPrompt(payload) },
      ],
      reasoning: { effort: getOpenAIReportReasoningEffort() },
      text: { format: { type: "json_object" }, verbosity: "high" },
      max_output_tokens: 18000,
    });

    return NextResponse.json({
      reportData: extractJSONFromText(raw),
      model: getOpenAIReportModel(),
    });
  } catch (err: unknown) {
    console.error("social-gpt-report unhandled error:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
