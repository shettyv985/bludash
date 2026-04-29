// app/api/manus-report/route.ts
import { NextRequest, NextResponse } from "next/server";

const MANUS_BASE = "https://api.manus.ai/v2";

// Map client name → env var prefix
function getClientEnvPrefix(client: string): string {
  // Normalize: uppercase, strip spaces/special chars
  return client.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getClientCredentials(client: string) {
  const prefix = getClientEnvPrefix(client);
  return {
    token: process.env[`${prefix}_TOKEN`] ?? "",
    fbPageId: process.env[`${prefix}_FB_PAGE_ID`] ?? "",
    igUserId: process.env[`${prefix}_IG_USER_ID`] ?? "",
    adAccountId: process.env[`${prefix}_AD_ACCOUNT_ID`] ?? "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const { type, client, from, to } = await req.json();

    const manusApiKey = process.env.MANUS_API_KEY;
    if (!manusApiKey) {
      return NextResponse.json(
        { error: "MANUS_API_KEY is missing in environment variables" },
        { status: 500 }
      );
    }

    const connectorIds =
      process.env.MANUS_CONNECTOR_IDS?.split(",")
        .map((id) => id.trim())
        .filter(Boolean) ?? [];

    const creds = getClientCredentials(client);

    if (!creds.token || !creds.adAccountId) {
      return NextResponse.json(
        {
          error: `No credentials found for client "${client}". Expected env vars: ${getClientEnvPrefix(client)}_TOKEN and ${getClientEnvPrefix(client)}_AD_ACCOUNT_ID`,
        },
        { status: 400 }
      );
    }

    // Lean, credit-efficient deep research prompt — only reliable ad account endpoints
    const prompt = `Review my Meta Ads performance for the last 30 days. Identify what's working, what's wasting budget, and give me actionable next steps.
You are a senior performance marketing analyst. Produce a deeply researched, insight-rich advertising performance report for the client ${client} covering ${from} to ${to}.

## STRICT RULES — READ BEFORE DOING ANYTHING

1. **FAILURE HANDLING**: If any API call returns an error, log the error message once and IMMEDIATELY move to the next step. Do NOT retry the same endpoint. Do NOT try alternative date ranges. Do NOT loop. One attempt per endpoint, then move on.
2. **NO LOOPS**: Never repeat a curl command with a slightly different parameter. If the data isn't available, note it as "Data unavailable" in the report and continue.
3. **EFFICIENCY**: Make exactly the 6 API calls listed below. No more, no less. Do not add extra calls.

---

## Your Credentials for Meta Graph API

- Access Token: ${creds.token}
- Ad Account ID: ${creds.adAccountId}

---

## PHASE 1: DATA COLLECTION (6 calls only)

Run all 6 of these curl commands and save to files. If any fails, save the error and move on immediately.

**Call 1 — Account Overview**
\`\`\`
curl -G "https://graph.facebook.com/v19.0/${creds.adAccountId}/insights" \\
  --data-urlencode "fields=spend,reach,impressions,clicks,ctr,cpm,cpc,frequency,unique_clicks,unique_ctr,actions,cost_per_action_type,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_thruplay_watched_actions,outbound_clicks,outbound_clicks_ctr" \\
  --data-urlencode 'time_range={"since":"${from}","until":"${to}"}' \\
  --data-urlencode "access_token=${creds.token}" > /tmp/account.json
\`\`\`

**Call 2 — All Campaigns**
\`\`\`
curl -G "https://graph.facebook.com/v19.0/${creds.adAccountId}/campaigns" \\
  --data-urlencode "fields=id,name,objective,status,daily_budget,lifetime_budget,insights{spend,reach,impressions,clicks,ctr,cpm,cpc,frequency,actions,cost_per_action_type,unique_clicks,unique_ctr}" \\
  --data-urlencode 'time_range={"since":"${from}","until":"${to}"}' \\
  --data-urlencode "access_token=${creds.token}" > /tmp/campaigns.json
\`\`\`

**Call 3 — All Ads with Metrics**
\`\`\`
curl -G "https://graph.facebook.com/v19.0/${creds.adAccountId}/ads" \\
  --data-urlencode "fields=id,name,status,campaign{name,objective},adset{name,optimization_goal,daily_budget},insights{spend,reach,impressions,clicks,ctr,cpm,cpc,frequency,actions,cost_per_action_type,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_thruplay_watched_actions,unique_clicks,unique_ctr,outbound_clicks}" \\
  --data-urlencode 'time_range={"since":"${from}","until":"${to}"}' \\
  --data-urlencode "access_token=${creds.token}" > /tmp/ads.json
\`\`\`

**Call 4 — Daily Trend**
\`\`\`
curl -G "https://graph.facebook.com/v19.0/${creds.adAccountId}/insights" \\
  --data-urlencode "fields=spend,reach,impressions,clicks,ctr,cpm,actions" \\
  --data-urlencode 'time_range={"since":"${from}","until":"${to}"}' \\
  --data-urlencode "time_increment=1" \\
  --data-urlencode "access_token=${creds.token}" > /tmp/daily.json
\`\`\`

**Call 5 — Age & Gender Breakdown**
\`\`\`
curl -G "https://graph.facebook.com/v19.0/${creds.adAccountId}/insights" \\
  --data-urlencode "fields=spend,reach,impressions,clicks,ctr,cpm,actions" \\
  --data-urlencode 'time_range={"since":"${from}","until":"${to}"}' \\
  --data-urlencode "breakdowns=age,gender" \\
  --data-urlencode "access_token=${creds.token}" > /tmp/demographics.json
\`\`\`

**Call 6 — Placement Breakdown**
\`\`\`
curl -G "https://graph.facebook.com/v19.0/${creds.adAccountId}/insights" \\
  --data-urlencode "fields=spend,reach,impressions,clicks,ctr,cpm,actions" \\
  --data-urlencode 'time_range={"since":"${from}","until":"${to}"}' \\
  --data-urlencode "breakdowns=publisher_platform,platform_position" \\
  --data-urlencode "access_token=${creds.token}" > /tmp/placements.json
\`\`\`

---

## PHASE 2: ANALYSIS

Parse all 6 JSON files. Extract every number. Then answer these questions analytically (these become the backbone of your report):

**Leads & CPL**
- What is the total lead count from actions where action_type = "lead" or "onsite_conversion.lead_grouped"?
- What is the CPL per campaign and per ad? Rank them best to worst.
- Which campaigns/ads generated zero leads despite significant spend?
- Industry benchmark for hospitality/catering/events in India: ₹80–250 CPL. How does this account compare?

**Efficiency**
- Account average CTR: calculate it. Which ads are >50% above average (stars)? Which are >30% below (laggards)?
- Account average CPM: calculate it. Which placements or campaigns are significantly more expensive?
- Which ads have high reach (top 25%) but low CTR (bottom 25%)? These are wasted awareness spends.
- Which ads have high frequency (>3) with declining CTR? Audience fatigue candidates.

**Creative Format**
- Separate video ads (those with video_thruplay_watched_actions or video_p25 data) from static ads.
- For video ads: compute average watch-through at p25/p50/p75/p95. Are people watching or dropping off?
- Which format — video vs static — has better CTR, lower CPM, lower CPL?

**Daily Trends**
- What was the daily average spend? Which days were significantly above/below?
- Did CTR trend up or down over the period? 
- Were there CPM spikes on specific days indicating auction competition?

**Placements**
- Rank all placements by CTR and by spend. 
- Which placements spent >10% of budget but delivered <5% of clicks?

**Audience**
- Which age+gender combination had the highest CTR? Lowest CPL?
- Which segments are overfunded relative to their performance?

---

## PHASE 3: WRITE THE PDF REPORT

Now produce a beautifully designed, professionally formatted PDF. Every section must cite real numbers from the data. No generic statements.

**Section 1 — Cover Page**
${client} | ${type} | ${from} to ${to} | Generated: today's date | Bludash Agency

**Section 2 — Executive Summary**
6–8 bullet points. Each must be a specific finding with a number. Example format: "Spent ₹X across 5 campaigns generating Y leads — average CPL of ₹Z vs industry benchmark of ₹80–250." Include the single biggest win and single biggest red flag.

**Section 3 — Account Performance Scorecard**
Table with all key metrics: Spend, Reach, Impressions, Clicks (all), Link Clicks, CTR, CPM, CPC, Frequency, Leads, CPL. Add a benchmark column where applicable. Color code: green if beating benchmark, red if below.

**Section 4 — Daily Performance Trend**
Describe the daily spend and CTR trend. Call out: peak day, lowest day, any CPM spike days. State whether performance improved or declined over the period.

**Section 5 — Campaign Deep Dive**
For each of the 5 campaigns, a mini-section with: metrics table (spend, reach, clicks, CTR, CPM, CPL, leads) + 3-sentence analyst verdict. Be direct: "This campaign is underperforming because X. It should be Y."

**Section 6 — Ad Performance Table**
Full table of all 16 ads. Columns: Ad Name, Campaign, Status, Spend, Reach, Impressions, Clicks, CTR, CPM, CPC, Likes, Shares, Video Views, Leads, CPL. Color-code CTR and CPL cells (green/yellow/red).

**Section 7 — Creative Format Analysis**
Video vs Static comparison table. Include: count of each, avg CTR, avg CPM, avg CPL, total leads. For videos: avg p25/p50/p75/p95 completion rates. State which format is winning and by what margin.

**Section 8 — Audience Breakdown**
Table of age/gender segments sorted by CTR desc. Highlight the top 2 converting segments and the bottom 2 wasted segments with specific spend figures.

**Section 9 — Placement Analysis**
Table of all placements: platform, position, spend, impressions, clicks, CTR, CPM. Flag any placement spending >₹2,000 with CTR below account average.

**Section 10 — Key Wins (What's Working)**
4–5 specific wins. Each must name the exact ad/campaign, cite 2–3 metrics, and explain why it's a win. Example: "BS POV Regal Wedding (BS LG CBO Wedding) — CTR 0.83%, CPM ₹60, 1,069 clicks from ₹7,789 spend. This is the account's most efficient awareness-to-click ad, running 23% cheaper CPM than account average."

**Section 11 — Red Flags (What's Not Working)**
4–5 specific problems. Same format: name the asset, cite the numbers, explain the problem clearly. Example: "LTS CATER — ₹4,947 spent, CPM ₹100 (29% above account avg), CTR 0.62% (21% below avg), only 104 video views. This ad is expensive and ignored. It has consumed 9.4% of total budget with proportionally poor returns."

**Section 12 — Prioritised Action Plan**
8–10 recommendations. Each must follow this exact structure:
▶ ACTION: [Specific action — pause/scale/restructure/test X]
📊 DATA: [The exact numbers that justify this — cite the ad name and metrics]
🎯 EXPECTED IMPACT: [What should improve and by roughly how much]
⚡ PRIORITY: HIGH / MEDIUM / LOW

**Section 13 — Budget Reallocation**
Current budget distribution table vs recommended distribution. Show exactly which campaigns to reduce, which to increase, and by how much (in ₹ and %). Justify each change with CPL data.

---

## OUTPUT REQUIREMENTS
- PDF file, downloadable
- Clean design: dark header, white body, color-coded metric cells (green ≥ benchmark, yellow within 20%, red > 20% below)
- Page numbers on every page
- Section headers clearly marked
- All currency in ₹ (Indian Rupee)
- No raw JSON anywhere in the document
- Be opinionated and direct — this is an analyst report, not a neutral summary
`.trim();

    const manusRes = await fetch(`${MANUS_BASE}/task.create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": manusApiKey,
      },
      body: JSON.stringify({
        message: {
          content: prompt,
          connectors: connectorIds,
        },
        title: `Bludash ${type} — ${client} — ${from} to ${to}`,
        hide_in_task_list: false,
        share_visibility: "private",
        interactive_mode: false,
        agent_profile: "manus-1.6",
      }),
    });

    const manusData = await manusRes.json();

    if (!manusRes.ok) {
      return NextResponse.json(
        {
          error:
            manusData?.error?.message ||
            manusData?.message ||
            "Failed to create Manus task",
        },
        { status: manusRes.status }
      );
    }

    return NextResponse.json({
      ok: true,
      taskId: manusData.task_id,
      taskUrl: manusData.task_url,
      taskTitle: manusData.task_title,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Something went wrong" },
      { status: 500 }
    );
  }
}