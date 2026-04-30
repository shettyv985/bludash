// app/api/manus-report/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { ReportPayload } from "@/lib/buildReportPayload";

const MANUS_BASE = "https://api.manus.ai/v2";

function buildPrompt(payload: ReportPayload): string {
  return `You are a world-class Meta Ads strategist with 15+ years of experience managing high-budget campaigns for premium brands in India. You are known for your brutally honest, data-driven analysis that identifies the EXACT reasons why campaigns succeed or fail — not generic advice.

CRITICAL INSTRUCTION: Your ENTIRE response must be a single valid JSON object. No markdown, no prose, no code fences, no explanation outside the JSON. Start with { and end with }.

You must analyze the data below with EXTREME SPECIFICITY. Every insight must:
- Reference the EXACT ad name, campaign name, spend amount, and metric
- Explain the PSYCHOLOGICAL or STRATEGIC reason WHY something is working or not
- Give ACTIONABLE next steps with expected numeric outcomes
- Compare against industry benchmarks provided in the data

For creative analysis specifically:
- Explain WHY a creative worked: Was it the hook? The emotion? The offer? The format? The CTA?
- Explain WHY a creative failed: Weak hook? Wrong audience? Poor visual hierarchy? No urgency?
- Reference the specific CTR, video view rate, engagement rate as evidence
- Suggest EXACTLY what to change (specific copy direction, visual style, CTA wording)

Return this exact JSON schema (all fields required, no nulls):
{
  "overallHealthScore": {
    "score": <1-10 integer>,
    "label": "<Poor|Below Average|Average|Good|Excellent>",
    "reasoning": "<4-5 sentences with specific numbers. State exact CTR, CPL, CPM vs benchmarks. Explain the single biggest factor dragging performance down and the single biggest bright spot.>"
  },
  "executiveSummary": "<5-7 sentence paragraph. Open with the most important finding. Quantify everything. Name specific campaigns and ads. Close with the single most urgent action.>",
  "keyTakeaways": [
    "<Takeaway with exact numbers — e.g. 'The Wedding vertical delivers 47% of all leads at 31% of total spend, making it the highest ROI vertical in the account'>",
    "<Takeaway>",
    "<Takeaway>",
    "<Takeaway>",
    "<Takeaway>"
  ],
  "accountDiagnosis": {
    "biggestProblem": "<The single most critical issue holding back performance, with exact data>",
    "biggestOpportunity": "<The single biggest untapped opportunity with estimated impact>",
    "spendEfficiencyScore": "<e.g. '43/100 — budget is heavily misallocated'>",
    "creativeHealthScore": "<e.g. '35/100 — only 2 of 8 creatives are performing above benchmark'>"
  },
  "whatIsWorking": [
    {
      "point": "<Short title>",
      "whyItWorks": "<Deep explanation of the psychological/strategic reason this works. Is it the creative format? The audience match? The offer? The hook? The emotion triggered? Reference exact metrics.>",
      "evidence": "<Exact metrics: CTR X%, CPL ₹X, Leads X, Spend ₹X, Engagement rate X%>",
      "recommendation": "<Exact scaling action with expected outcome — e.g. 'Increase daily budget from ₹500 to ₹800, expected to generate 15 additional leads at similar CPL'>",
      "scalingPotential": "<High|Medium|Low with reason>"
    }
  ],
  "whatIsNotWorking": [
    {
      "point": "<Short title>",
      "whyItFails": "<Deep diagnosis of the root cause. Is it a creative problem (hook, format, message)? Audience mismatch? Offer problem? Landing page? Ad fatigue? Reference exact metrics as evidence.>",
      "evidence": "<Exact metrics showing failure>",
      "recommendation": "<Exact fix — what to change, how to change it, expected result>",
      "verdict": "<Pause Immediately|Needs Creative Fix|Needs Audience Fix|Needs Budget Reallocation>"
    }
  ],
  "creativeDeepDive": {
    "topPerformer": {
      "adName": "<exact ad name>",
      "whyItWorks": "<Detailed breakdown: What is the hook doing? What emotion does it trigger? Why does the audience respond? What is the creative format advantage? What makes the CTA compelling? Minimum 4 sentences.>",
      "keyMetrics": "<CTR: X%, CPL: ₹X, Leads: X, Video view rate: X%, Engagement rate: X%>",
      "whatToReplicate": "<Specific creative direction for new ads based on what works here — e.g. 'POV-style first-person perspective, emotional wedding moment in first 3 seconds, urgency-driven CTA'>"
    },
    "worstPerformer": {
      "adName": "<exact ad name>",
      "whyItFails": "<Detailed creative autopsy: What is the hook doing wrong? What is the audience experiencing in the first 3 seconds? Why are they scrolling past? What emotional or logical trigger is missing? Minimum 4 sentences.>",
      "keyMetrics": "<CTR: X%, CPL: ₹X, Spend wasted: ₹X, Video view rate: X%>",
      "whatToChange": "<Specific creative brief for replacement — exact hook concept, visual style, messaging angle, CTA>"
    },
    "creativeRankings": [
      {
        "rank": 1,
        "adName": "<name>",
        "verdict": "<one sentence why this ranks here>",
        "ctr": "<X%>",
        "cpl": "<₹X or N/A>",
        "leads": <number>,
        "spend": "<₹X>",
        "creativeDiagnosis": "<2-3 sentences on creative effectiveness>"
      }
    ],
    "formatAnalysis": {
      "videoVsStatic": "<Analysis of video performance vs static — which format is winning and why based on the data>",
      "recommendations": ["<Specific format recommendation>", "<Specific format recommendation>"]
    }
  },
  "campaignAnalysis": [
    {
      "campaignName": "<exact name>",
      "verdict": "<Performing Well|Needs Attention|Underperforming|Burn Risk>",
      "spendShare": "<X% of total budget>",
      "leadsShare": "<X% of total leads>",
      "efficiency": "<CPL ₹X vs account average ₹X — X% above/below average>",
      "rootCause": "<The specific reason this campaign is performing at this level — audience, creative, offer, objective alignment, or budget>",
      "analysis": "<3-4 sentences with specific metrics, named ads, and clear diagnosis>",
      "action": "<Specific action with exact budget/bid numbers if relevant>",
      "urgency": "<Do Today|This Week|This Month>"
    }
  ],
  "adSetAnalysis": [
    {
      "adSetName": "<name>",
      "campaignName": "<parent campaign>",
      "spend": "<₹X>",
      "leads": <number>,
      "cpl": "<₹X>",
      "observation": "<Key insight about this ad set's targeting or budget performance>",
      "recommendation": "<Specific action>"
    }
  ],
  "budgetOptimization": {
    "currentAllocation": "<Assessment of how budget is currently split and the efficiency of that split>",
    "wastedSpend": "<Estimated ₹X being wasted on underperforming ads with specific names>",
    "summary": "<Overall budget health with specific reallocation recommendation>",
    "actions": [
      {
        "action": "<Specific reallocation — e.g. 'Move ₹500/day from LG CBO Corporate to BS LG CBO Wedding'>",
        "reason": "<Exact data-backed reason>",
        "expectedImpact": "<Projected outcome — e.g. 'Expected to reduce account CPL from ₹393 to ₹310 within 7 days'>"
      }
    ]
  },
  "audienceAndTargeting": {
    "whatTheDataReveals": "<What does the performance variance across campaigns tell us about which audiences are most receptive? Be specific.>",
    "highPerformingAudiences": ["<Describe the audience that is responding best and why>"],
    "failingAudiences": ["<Describe the audience that is not converting and why>"],
    "observations": "<Deep targeting analysis — what does CTR and engagement data reveal about audience-message fit?>",
    "recommendations": ["<Specific targeting recommendation>", "<Specific targeting recommendation>", "<Specific targeting recommendation>"]
  },
  "leadsAnalysis": {
    "totalLeads": <number>,
    "costPerLead": "<₹X>",
    "leadQualityAssessment": "<Based on CPL trends and campaign objectives, assess likely lead quality>",
    "bestLeadSource": "<Which ad/campaign/adset is generating the best leads at the best cost and why>",
    "worstLeadSource": "<Which ad/campaign is burning budget with worst lead efficiency>",
    "observations": "<Full analysis of lead generation patterns>",
    "recommendations": ["<Specific lead gen recommendation>", "<Specific lead gen recommendation>"]
  },
  "competitiveContext": {
    "benchmarkComparison": "<How does this account's CTR, CPL, CPM compare to the provided industry benchmarks? What does this tell us about competitive positioning?>",
    "marketObservations": "<What do the CPM trends suggest about auction competitiveness in these verticals?>"
  },
  "prioritizedActions": [
    {
      "priority": <1-10, where 1 is most urgent>,
      "action": "<Specific, executable action — not vague advice>",
      "reason": "<Exact data reason — reference specific ad names and numbers>",
      "expectedResult": "<Measurable outcome with estimated numbers>",
      "effort": "<Low|Medium|High>",
      "timeToImpact": "<24hrs|3-5 days|1-2 weeks>"
    }
  ],
  "thirtyDayPlan": [
    {
      "week": "Week 1",
      "focus": "<Theme>",
      "goal": "<Specific measurable goal for this week>",
      "tasks": [
        "<Specific task with exact ad names, numbers, and actions>",
        "<Specific task>",
        "<Specific task>"
      ]
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

--- FULL PERFORMANCE DATA ---
${JSON.stringify(payload, null, 2)}`;
}

export async function POST(req: NextRequest) {
  const manusApiKey = process.env.MANUS_API_KEY;
  if (!manusApiKey) {
    return NextResponse.json({ error: "MANUS_API_KEY is not configured" }, { status: 500 });
  }

  let payload: ReportPayload;
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
        message: {
          content: buildPrompt(payload),
        },
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
      console.error("Manus task.create HTTP error:", res.status, data);
      return NextResponse.json(
        { error: data?.error?.message ?? data?.message ?? `Manus API error (${res.status})` },
        { status: res.status }
      );
    }

    const taskId: string = data.task_id ?? data.id ?? "";
    if (!taskId) {
      console.error("No task_id in Manus response:", data);
      return NextResponse.json({ error: "Manus did not return a task ID" }, { status: 500 });
    }

    return NextResponse.json({ taskId });
  } catch (err: any) {
    console.error("manus-report unhandled error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}