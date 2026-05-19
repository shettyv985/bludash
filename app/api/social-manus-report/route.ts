// app/api/social-manus-report/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { SocialReportPayload } from "@/lib/buildSocialReportPayload";
import { getMetaClientConfig } from "@/lib/metaClientConfig";

const MANUS_BASE = "https://api.manus.ai/v2";

function buildPrompt(payload: SocialReportPayload): string {
  // Limit posts sent to Manus to the strongest candidates while keeping room for diagnosis.
  // Full post list is still in payload.posts but rankings already surface the key ones
 // Top posts by engagement for deep analysis focus
const postsForAnalysis = [...payload.posts]
  .sort((a, b) => b.engagementRate - a.engagementRate)
  .slice(0, 40);

// Bottom posts by engagement for red flag detection (separate so Manus sees both ends)
const worstPosts = [...payload.posts]
  .filter(p => p.totalReach > 50) // only meaningful reach
  .sort((a, b) => a.engagementRate - b.engagementRate)
  .slice(0, 20);

// All boosted posts regardless of ranking (always include for spend analysis)
const boostedForAnalysis = payload.posts.filter(p => p.isBoosted);

// All reels regardless of ranking (always include for hook analysis)
const reelsForAnalysis = payload.posts.filter(p => p.type === "REEL");

// Posts that need decision-making: paid, high reach, or high opportunity cost.
const attentionRequiredPosts = [...payload.posts]
  .filter((p: any) => p.totalReach > 100 || p.amountSpent > 0 || p.isBoosted)
  .sort((a: any, b: any) => {
    const aSpend = Number(a.amountSpent || 0);
    const bSpend = Number(b.amountSpent || 0);
    const aRisk = (a.totalReach || 0) * Math.max(0, 3 - (a.engagementRate || 0)) + aSpend * 20;
    const bRisk = (b.totalReach || 0) * Math.max(0, 3 - (b.engagementRate || 0)) + bSpend * 20;
    return bRisk - aRisk;
  })
  .slice(0, 20);

  const comparisonBlock = payload.comparison.available
    ? `\n\nPREVIOUS PERIOD COMPARISON (${payload.comparison.periodLabel}):\n${JSON.stringify(payload.comparison, null, 2)}`
    : "\n\nNOTE: No comparison period data is available for this report.";

  return `You are a world-class Social Media strategist specialising in Facebook and Instagram organic + paid content for Indian brands. You are known for brutally honest, data-driven analysis that identifies the EXACT reasons why content succeeds or fails.

CRITICAL INSTRUCTION: Your ENTIRE response must be a single valid JSON object. No markdown, no prose, no code fences, no explanation outside the JSON. Start with { and end with }.

AUTHORITATIVE META ACCOUNT CONTEXT:
- Client key: ${payload.meta.client}
- Client/account name: ${payload.meta.clientName ?? payload.meta.client}
- Meta ad account ID: ${payload.meta.adAccountId ?? "NOT PROVIDED"}
- Meta ad account name: ${payload.meta.adAccountName ?? payload.meta.clientName ?? payload.meta.client}
- Report date range: ${payload.meta.from} to ${payload.meta.to}
- Platform filter: ${payload.meta.platform}
Use ONLY this pre-calculated payload. Do NOT infer, browse, switch, or select any other ad account. If any ad/account identity appears elsewhere, ignore it unless it matches the Meta ad account ID above.

Every insight must:
- Reference the EXACT post caption (first 80 chars), platform, date, and metric
- Explain the PSYCHOLOGICAL or STRATEGIC reason WHY something worked or failed
- Give ACTIONABLE next steps with expected outcomes
- Compare against benchmarks (Engagement rate good ≥3%, ok ≥1%)
- For Reels: reference views, hold rate with held people count, skip rate with skipped people count (good ≤25%, ok ≤50%, bad >50%), AND avg watch time
- For MoM comparisons: use the comparison block to state exact % changes and call out if a trend is improving or declining

DEPTH MANDATE:
- Never stop at "worked" or "did not work". Diagnose the mechanism: hook, format, emotion, offer, timing, visual, caption, audience fit, platform fit, paid distribution, or cultural relevance.
- Separate organic success from paid-inflated success. If reach is high because of boosting but engagement is weak, say that paid reach is masking weak content.
- Every weak post needs a root-cause label: Weak Hook, Weak Visual, Weak Caption, Wrong Format, Wrong Platform, Wrong Audience, Spend Mismatch, Low Save Intent, Low Share Intent, or Creative Fatigue.
- Every winning post needs a replication formula: what to repeat, where to use it, what not to change, and which metric should improve.
- Every recommendation must read like an execution instruction: what to change, where to change it, how to execute it, and the expected metric movement.
- Flag four categories clearly: SCALE, FIX, STOP, and TEST.

REEL HOOK QUALITY GUIDE (use in your analysis):
- Skip rate ≤20% = Exceptional hook — opening 3 seconds is highly compelling
- Skip rate 20–35% = Good hook retention
- Skip rate 35–50% = Moderate — hook needs improvement
- Skip rate >50% = Weak hook — most viewers bail in first 3 seconds
- Avg watch time <5s = Critical failure regardless of skip rate
- Avg watch time 10–20s = Acceptable for short-form
- Avg watch time >20s = Strong content depth
- Hold rate = 100 - skip rate when available; higher hold is better

Return this exact JSON schema (all fields required, do not add extra fields):
{
  "overallHealthScore": {
    "score": <1-10 integer>,
    "label": "<Poor|Below Average|Average|Good|Excellent>",
    "reasoning": "<4-5 sentences with specific numbers. State exact engagement rates vs benchmarks. Name the single biggest content problem and biggest bright spot. If comparison data is available, state whether performance is improving or declining vs prior period.>"
  },
  "executiveSummary": "<5-7 sentence paragraph. Open with the most important finding. Quantify everything. Name specific posts. If comparison data is available, lead with the most significant MoM change. Close with the single most urgent action.>",
  "keyTakeaways": [
    "<Takeaway with exact numbers>",
    "<Takeaway>",
    "<Takeaway>",
    "<Takeaway>",
    "<Takeaway>"
  ],
  "accountDiagnosis": {
    "biggestProblem": "<The single most critical issue across both platforms, with exact data>",
    "biggestOpportunity": "<The single biggest untapped opportunity with estimated impact>",
    "contentHealthScore": "<e.g. '41/100 — only 3 of 12 posts exceeded 3% engagement rate'>",
    "audienceGrowthScore": "<e.g. '67/100 — net follower growth is positive but slowing'>",
    "rootCause": "<The underlying strategic reason the account is underperforming or winning. Tie it to post evidence, platform behavior, and audience response.>",
    "whereTheAccountIsLacking": [
      {
        "area": "<Hook|Creative|Caption|Format Mix|Boosting|Audience Growth|Posting Cadence|Platform Fit>",
        "severity": "<High|Medium|Low>",
        "evidence": "<Exact post/metric proof>",
        "whyItMatters": "<Business/social impact>",
        "fix": "<Exact action to correct it>"
      }
    ]
  },
  "periodComparison": {
    "available": <true|false>,
    "headline": "<One sentence: e.g. 'Instagram engagement improved 34% MoM while Facebook reach declined 12%' — or 'No comparison data available'>",
    "improvements": ["<Metric that improved with exact numbers and % change>"],
    "declines": ["<Metric that declined with exact numbers and % change>"],
    "stableMetrics": ["<Metric that stayed flat>"],
    "trend": "<Overall trend: Improving|Declining|Mixed|Stable>",
    "keyInsight": "<2-3 sentences on what the MoM data reveals about account trajectory and what's driving the change>"
  },
  "reelHookAnalysis": {
    "available": <true if any reels have skipRate data, false otherwise>,
    "avgSkipRate": "<e.g. '42%' or 'No data'>",
    "avgWatchTime": "<e.g. '11s' or 'No data'>",
    "avgHoldRate": "<e.g. '58%' or 'No data'>",
    "totalViews": "<number or 'No data'>",
    "hookQualityRating": "<Excellent|Good|Moderate|Poor|No Data>",
    "bestHook": {
      "postCaption": "<caption>",
      "views": "<number>",
      "skipRate": "<X%>",
      "holdRate": "<X%>",
      "watchTime": "<Xs>",
      "whyItWorks": "<What specifically in the first 3 seconds makes viewers stay>"
    },
    "worstHook": {
      "postCaption": "<caption>",
      "views": "<number>",
      "skipRate": "<X%>",
      "holdRate": "<X%>",
      "watchTime": "<Xs>",
      "whyItFails": "<What is causing the skip in first 3 seconds>"
    },
    "hookImprovementPlan": "<Specific 3-step plan to improve reel hooks based on this data>"
  },
  "whatIsWorking": [
    {
      "point": "<Short title>",
      "platform": "<FB|IG|Both>",
      "whyItWorks": "<Deep explanation. Is it the format (Reel vs image)? The emotional hook? The timing? The caption style? The visual? For Reels: reference views, hold rate with held people count, skip rate with skipped people count, and watch time data. Reference exact engagement rates and reach.>",
      "evidence": "<Exact metrics: Engagement rate X%, Reach X, Views X, Likes X, Saves X, Watch time Xs, Skip rate X% (Y people), Hold rate X% (Y people)>",
      "recommendation": "<Exact scaling action — e.g. 'Post 3 Reels per week with similar POV-style hook, expected to increase avg engagement rate from 2.1% to 4%'>",
      "scalingPotential": "<High|Medium|Low with reason>"
    }
  ],
  "whyItWorkedPatterns": [
    {
      "pattern": "<Repeatable success pattern>",
      "workedBecause": "<Deep reason this pattern created attention, engagement, saves, shares, clicks, or follower growth>",
      "proofPosts": ["<caption + platform + key metric>", "<caption + platform + key metric>"],
      "howToRepeat": "<Specific repeatable content formula>",
      "expectedMetricLift": "<Expected measurable lift>"
    }
  ],
  "whatIsNotWorking": [
    {
      "point": "<Short title>",
      "platform": "<FB|IG|Both>",
      "whyItFails": "<Deep diagnosis. Is it wrong format for algorithm? Weak hook (reference skip rate)? Caption too long? Wrong posting time? Poor visual quality? Audience mismatch? Reference exact metrics.>",
      "evidence": "<Exact metrics showing failure, including views, hold rate with held people count, skip rate with skipped people count, and watch time for Reels>",
      "recommendation": "<Exact fix>",
      "verdict": "<Stop This Format|Fix The Hook|Fix The Caption|Fix The Visual|Wrong Platform>"
    }
  ],
  "whyItDidNotWorkPatterns": [
    {
      "pattern": "<Repeatable failure pattern>",
      "failedBecause": "<Deep reason this pattern lost attention or failed algorithm/audience fit>",
      "proofPosts": ["<caption + platform + key metric>", "<caption + platform + key metric>"],
      "whatToStop": "<Exact behavior, format, hook, caption, or boosting choice to stop>",
      "replacement": "<Exact replacement formula>"
    }
  ],
  "postLevelActionMap": [
    {
      "platform": "<FB|IG>",
      "postCaption": "<first 80 chars>",
      "postType": "<REEL|IMAGE|CAROUSEL>",
      "date": "<date>",
      "classification": "<Scale|Fix|Stop|Test|Boost|Do Not Boost>",
      "workedOrFailed": "<Worked|Failed|Mixed>",
      "why": "<Exact root-cause diagnosis using the metrics>",
      "action": "<Specific next action for this exact post or its format>",
      "priority": "<High|Medium|Low>",
      "metricToWatch": "<Engagement Rate|Reach|Saves|Shares|Skip Rate|CTR|Follower Growth>"
    }
  ],
  "contentDeepDive": {
    "topPerformer": {
      "platform": "<FB|IG>",
      "postCaption": "<first 80 chars of caption>",
      "postType": "<REEL|IMAGE|CAROUSEL>",
      "whyItWorks": "<Detailed breakdown: What is the hook doing? What emotion does it trigger? Why does this format win on this platform? For Reels: what do the views, hold rate, skip rate, and watch time tell us? What makes it shareable? Minimum 4 sentences.>",
      "keyMetrics": "<Engagement rate: X%, Reach: X, Views: X, Likes: X, Saves: X, Watch time: Xs, Skip rate: X% (Y people), Hold rate: X% (Y people)>",
      "whatToReplicate": "<Specific content brief for next post based on what works here>"
    },
    "worstPerformer": {
      "platform": "<FB|IG>",
      "postCaption": "<first 80 chars>",
      "postType": "<REEL|IMAGE|CAROUSEL>",
      "whyItFails": "<Detailed content autopsy. For Reels: lead with skip rate diagnosis. What is failing? Hook? Visual? Caption? Format for platform? Algorithm signals? Minimum 4 sentences.>",
      "keyMetrics": "<Engagement rate: X%, Reach: X, Views: X, Likes: X, Skip rate: X% (Y people), Hold rate: X% (Y people), Watch time: Xs>",
      "whatToChange": "<Specific content brief for replacement>"
    },
    "contentRankings": [
      {
        "rank": <1-20, rank all posts passed in>,
        "platform": "<FB|IG>",
        "postCaption": "<first 60 chars>",
        "postType": "<type>",
        "engagementRate": "<X%>",
        "reach": <number>,
        "likes": <number>,
        "isBoosted": <boolean>,
        "views": <number>,
        "skipRate": "<X% or —>",
        "holdRate": "<X% or —>",
        "avgWatchTime": "<Xs or —>",
        "diagnosis": "<2 sentences on why this ranks here>"
      }
    ],
    "formatAnalysis": {
      "fbBestFormat": "<Which format (image/reel/video) performs best on FB for this account and why>",
      "igBestFormat": "<Which format (reel/carousel/image) performs best on IG for this account and why>",
      "reelAnalysis": "<Deep analysis of Reel performance — views, hold rate with held people count, hook quality based on skip rate/skipped people data, watch time patterns, engagement trends. Reference specific numbers.>",
      "carouselAnalysis": "<Analysis of carousel performance — save rate signals, engagement vs reels>",
      "recommendations": ["<Specific format recommendation>", "<Specific format recommendation>", "<Specific format recommendation>"]
    }
  },
  "platformComparison": {
    "fbVsIg": "<Which platform is performing better overall and why based on the data. If MoM data available, state which platform improved more.>",
    "audienceBehavior": "<How does the audience behave differently on FB vs IG — what content triggers action on each?>",
    "crossPostingOpportunity": "<Should content be cross-posted? What adaptations are needed?>",
    "platformRecommendations": {
      "fb": "<Top 3 specific recommendations for Facebook only>",
      "ig": "<Top 3 specific recommendations for Instagram only>"
    }
  },
  "boostingAnalysis": {
    "overallAssessment": "<Were the boosted posts worth the spend? What was the ROI in terms of engagement and reach uplift?>",
    "bestBoostedPost": "<Which boosted post gave the best return and why>",
    "worstBoostedPost": "<Which boosted post wasted the most money and why>",
    "boostingStrategy": "<Should they continue boosting? What content is worth boosting vs organic-only?>",
    "recommendations": ["<Specific boosting recommendation>", "<Specific boosting recommendation>"]
  },
  "audienceGrowth": {
    "fbFollowerAnalysis": "<Analysis of FB follow/unfollow trend. Is growth healthy? If MoM data available, state whether growth is accelerating or slowing.>",
    "igFollowerAnalysis": "<Analysis of IG follow/unfollow trend with MoM context if available>",
    "growthDrivers": "<What specific content types or posts are driving the most follower growth?>",
    "churnRisk": "<Is there a content type driving unfollows? What should be avoided?>",
    "recommendations": ["<Specific growth recommendation>", "<Specific growth recommendation>", "<Specific growth recommendation>"]
  },
  "contentCalendarInsights": {
    "postingFrequency": "<Is the current posting frequency optimal? What does the data suggest about posting cadence?>",
    "bestPerformingDays": "<Based on the post dates and performance, which days seem to perform best?>",
    "contentMixRecommendation": "<Ideal weekly content mix — e.g. '3 Reels, 2 Carousels, 1 static image per week on IG'>",
    "captionStrategy": "<Analysis of caption length and style — what caption approach is working?>"
  },
  "prioritizedActions": [
    {
      "priority": <1-10, where 1 is most urgent>,
      "action": "<Specific, executable action>",
      "reason": "<Exact data reason — reference specific posts and numbers>",
      "expectedResult": "<Measurable outcome>",
      "effort": "<Low|Medium|High>",
      "timeToImpact": "<24hrs|3-5 days|1-2 weeks>"
    }
  ],
  "stopStartContinue": {
    "stop": [
      {
        "item": "<What to stop doing>",
        "why": "<Exact evidence and failure reason>",
        "replacement": "<What to do instead>"
      }
    ],
    "start": [
      {
        "item": "<What to start doing>",
        "why": "<Opportunity evidence>",
        "firstStep": "<What to do tomorrow>"
      }
    ],
    "continue": [
      {
        "item": "<What to keep doing>",
        "why": "<Exact evidence it works>",
        "scalePlan": "<How to scale it>"
      }
    ]
  },
  "experimentsToRun": [
    {
      "experiment": "<Specific A/B or content experiment>",
      "hypothesis": "<Why this should work based on the data>",
      "execution": "<Exact creative/caption/format instructions>",
      "successMetric": "<Metric and target>",
      "duration": "<1 week|2 weeks|30 days>"
    }
  ],
  "thirtyDayPlan": [
    {
      "week": "Week 1",
      "focus": "<Theme>",
      "goal": "<Specific measurable goal>",
      "tasks": ["<Specific task>", "<Specific task>", "<Specific task>"]
    },
    {
      "week": "Week 2",
      "focus": "<Theme>",
      "goal": "<Specific measurable goal>",
      "tasks": ["<task>", "<task>", "<task>"]
    },
    {
      "week": "Week 3",
      "focus": "<Theme>",
      "goal": "<Specific measurable goal>",
      "tasks": ["<task>", "<task>", "<task>"]
    },
    {
      "week": "Week 4",
      "focus": "<Theme>",
      "goal": "<Specific measurable goal>",
      "tasks": ["<task>", "<task>", "<task>"]
    }
  ],
  "quickWins": [
    {
      "action": "<Something that can be done in under 10 minutes with immediate impact>",
      "expectedImpact": "<Projected result>",
      "howTo": "<Step by step instruction>"
    }
  ]
}

--- FULL SOCIAL MEDIA PERFORMANCE DATA ---


SUMMARY & RANKINGS (pre-calculated):
${JSON.stringify({
  meta: payload.meta,
  summary: payload.summary,
  benchmarks: payload.benchmarks,
  rankings: payload.rankings,
  redFlags: payload.redFlags,
  positives: payload.positives,
  contentMix: payload.contentMix,
}, null, 2)}

TOP POSTS BY ENGAGEMENT (top 40):
${JSON.stringify(postsForAnalysis, null, 2)}

WORST POSTS BY ENGAGEMENT (bottom 20, reach > 50):
${JSON.stringify(worstPosts, null, 2)}

ATTENTION REQUIRED POSTS (high reach, paid spend, low engagement risk, or boosted):
${JSON.stringify(attentionRequiredPosts, null, 2)}

ALL BOOSTED POSTS (complete spend data):
${JSON.stringify(boostedForAnalysis, null, 2)}

ALL REELS (complete hook data):
${JSON.stringify(reelsForAnalysis, null, 2)}
${comparisonBlock}`;}

export async function POST(req: NextRequest) {
  const manusApiKey = process.env.MANUS_API_KEY;
  if (!manusApiKey) {
    return NextResponse.json({ error: "MANUS_API_KEY is not configured" }, { status: 500 });
  }

  let payload: SocialReportPayload;
  try {
    const body = await req.json();
    payload = body.payload;
    if (!payload) throw new Error("Missing payload field");
  } catch (err: any) {
    return NextResponse.json({ error: `Invalid request body: ${err.message}` }, { status: 400 });
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
    const res = await fetch(`${MANUS_BASE}/task.create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": manusApiKey,
      },
      body: JSON.stringify({
        message: { content: buildPrompt(payload) },
      }),
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      console.error("Non-JSON from Manus task.create:", text.slice(0, 500));
      return NextResponse.json({ error: "Manus returned a non-JSON response" }, { status: 500 });
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message ?? data?.message ?? `Manus API error (${res.status})` },
        { status: res.status }
      );
    }

    const taskId: string = data.task_id ?? data.id ?? "";
    if (!taskId) {
      return NextResponse.json({ error: "Manus did not return a task ID" }, { status: 500 });
    }

    // ← NEW: return taskUrl if Manus provides it at creation time
    const taskUrl: string | null = data.task_url ?? data.url ?? null;

    return NextResponse.json({ taskId, taskUrl });
  } catch (err: any) {
    console.error("social-manus-report unhandled error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}
