// app/api/social-manus-report/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { SocialReportPayload } from "@/lib/buildSocialReportPayload";

const MANUS_BASE = "https://api.manus.ai/v2";

function buildPrompt(payload: SocialReportPayload): string {
  // Limit posts sent to Manus to top 30 by engagement rate to stay within context limits
  // Full post list is still in payload.posts but rankings already surface the key ones
 // Top 30 by engagement for deep analysis focus
const postsForAnalysis = [...payload.posts]
  .sort((a, b) => b.engagementRate - a.engagementRate)
  .slice(0, 30);

// Bottom 10 by engagement for red flag detection (separate so Manus sees both ends)
const worstPosts = [...payload.posts]
  .filter(p => p.totalReach > 100) // only meaningful reach
  .sort((a, b) => a.engagementRate - b.engagementRate)
  .slice(0, 10);

// All boosted posts regardless of ranking (always include for spend analysis)
const boostedForAnalysis = payload.posts.filter(p => p.isBoosted);

// All reels regardless of ranking (always include for hook analysis)
const reelsForAnalysis = payload.posts.filter(p => p.type === "REEL");

  const comparisonBlock = payload.comparison.available
    ? `\n\nPREVIOUS PERIOD COMPARISON (${payload.comparison.periodLabel}):\n${JSON.stringify(payload.comparison, null, 2)}`
    : "\n\nNOTE: No comparison period data is available for this report.";

  return `You are a world-class Social Media strategist specialising in Facebook and Instagram organic + paid content for Indian brands. You are known for brutally honest, data-driven analysis that identifies the EXACT reasons why content succeeds or fails.

CRITICAL INSTRUCTION: Your ENTIRE response must be a single valid JSON object. No markdown, no prose, no code fences, no explanation outside the JSON. Start with { and end with }.

Every insight must:
- Reference the EXACT post caption (first 80 chars), platform, date, and metric
- Explain the PSYCHOLOGICAL or STRATEGIC reason WHY something worked or failed
- Give ACTIONABLE next steps with expected outcomes
- Compare against benchmarks (Engagement rate good ≥3%, ok ≥1%)
- For Reels: reference skip rate (good ≤25%, ok ≤50%, bad >50%) AND avg watch time
- For MoM comparisons: use the comparison block to state exact % changes and call out if a trend is improving or declining

REEL HOOK QUALITY GUIDE (use in your analysis):
- Skip rate ≤20% = Exceptional hook — opening 3 seconds is highly compelling
- Skip rate 20–35% = Good hook retention
- Skip rate 35–50% = Moderate — hook needs improvement
- Skip rate >50% = Weak hook — most viewers bail in first 3 seconds
- Avg watch time <5s = Critical failure regardless of skip rate
- Avg watch time 10–20s = Acceptable for short-form
- Avg watch time >20s = Strong content depth

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
    "audienceGrowthScore": "<e.g. '67/100 — net follower growth is positive but slowing'>"
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
    "hookQualityRating": "<Excellent|Good|Moderate|Poor|No Data>",
    "bestHook": {
      "postCaption": "<caption>",
      "skipRate": "<X%>",
      "watchTime": "<Xs>",
      "whyItWorks": "<What specifically in the first 3 seconds makes viewers stay>"
    },
    "worstHook": {
      "postCaption": "<caption>",
      "skipRate": "<X%>",
      "watchTime": "<Xs>",
      "whyItFails": "<What is causing the skip in first 3 seconds>"
    },
    "hookImprovementPlan": "<Specific 3-step plan to improve reel hooks based on this data>"
  },
  "whatIsWorking": [
    {
      "point": "<Short title>",
      "platform": "<FB|IG|Both>",
      "whyItWorks": "<Deep explanation. Is it the format (Reel vs image)? The emotional hook? The timing? The caption style? The visual? For Reels: reference skip rate and watch time data. Reference exact engagement rates and reach.>",
      "evidence": "<Exact metrics: Engagement rate X%, Reach X, Likes X, Saves X, Watch time Xs, Skip rate X%>",
      "recommendation": "<Exact scaling action — e.g. 'Post 3 Reels per week with similar POV-style hook, expected to increase avg engagement rate from 2.1% to 4%'>",
      "scalingPotential": "<High|Medium|Low with reason>"
    }
  ],
  "whatIsNotWorking": [
    {
      "point": "<Short title>",
      "platform": "<FB|IG|Both>",
      "whyItFails": "<Deep diagnosis. Is it wrong format for algorithm? Weak hook (reference skip rate)? Caption too long? Wrong posting time? Poor visual quality? Audience mismatch? Reference exact metrics.>",
      "evidence": "<Exact metrics showing failure, including skip rate and watch time for Reels>",
      "recommendation": "<Exact fix>",
      "verdict": "<Stop This Format|Fix The Hook|Fix The Caption|Fix The Visual|Wrong Platform>"
    }
  ],
  "contentDeepDive": {
    "topPerformer": {
      "platform": "<FB|IG>",
      "postCaption": "<first 80 chars of caption>",
      "postType": "<REEL|IMAGE|CAROUSEL>",
      "whyItWorks": "<Detailed breakdown: What is the hook doing? What emotion does it trigger? Why does this format win on this platform? For Reels: what do the skip rate and watch time tell us? What makes it shareable? Minimum 4 sentences.>",
      "keyMetrics": "<Engagement rate: X%, Reach: X, Likes: X, Saves: X, Watch time: Xs, Skip rate: X%>",
      "whatToReplicate": "<Specific content brief for next post based on what works here>"
    },
    "worstPerformer": {
      "platform": "<FB|IG>",
      "postCaption": "<first 80 chars>",
      "postType": "<REEL|IMAGE|CAROUSEL>",
      "whyItFails": "<Detailed content autopsy. For Reels: lead with skip rate diagnosis. What is failing? Hook? Visual? Caption? Format for platform? Algorithm signals? Minimum 4 sentences.>",
      "keyMetrics": "<Engagement rate: X%, Reach: X, Likes: X, Skip rate: X%, Watch time: Xs>",
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
        "skipRate": "<X% or —>",
        "avgWatchTime": "<Xs or —>",
        "diagnosis": "<2 sentences on why this ranks here>"
      }
    ],
    "formatAnalysis": {
      "fbBestFormat": "<Which format (image/reel/video) performs best on FB for this account and why>",
      "igBestFormat": "<Which format (reel/carousel/image) performs best on IG for this account and why>",
      "reelAnalysis": "<Deep analysis of Reel performance — hook quality based on skip rate data, watch time patterns, engagement trends. Reference specific numbers.>",
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

TOP POSTS BY ENGAGEMENT (top 30):
${JSON.stringify(postsForAnalysis, null, 2)}

WORST POSTS BY ENGAGEMENT (bottom 10, reach > 100):
${JSON.stringify(worstPosts, null, 2)}

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