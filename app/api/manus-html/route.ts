// app/api/manus-html/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { ReportPayload } from "@/lib/buildReportPayload";

const MANUS_BASE = "https://api.manus.ai/v2";

function buildHTMLPrompt(payload: ReportPayload, reportData: any): string {
  return `You are an expert frontend developer and Meta Ads analyst. Your ONLY job is to write a single complete HTML file as your reply.

⚠️ CRITICAL OUTPUT RULES — READ THESE FIRST:
1. Your ENTIRE response must be the raw HTML code itself. Nothing else.
2. Start your response with <!DOCTYPE html> — the very first character must be 
3. End your response with </html> — nothing after it.
4. Do NOT save to a file. Do NOT upload a file. Do NOT describe what you made.
5. Do NOT say "Here is the report" or any preamble. Just output the HTML directly.
6. Zero markdown. Zero code fences (\`\`\`). Zero explanation outside the HTML tags.
7. If you write even one sentence of prose outside the HTML tags, the task fails.

DESIGN SYSTEM (use exactly these values):
- Page background: #0a0f1e
- Card bg: #111827
- Card border: 1px solid rgba(255,255,255,0.07)
- Card border-radius: 12px
- Accent blue: #3b82f6
- Accent emerald: #10b981
- Accent red: #ef4444
- Accent amber: #f59e0b
- Text primary: #f1f5f9
- Text muted: #94a3b8
- Text dimmed: #475569
- Header gradient: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #1e40af 100%)
- Good metric color: #10b981 (emerald)
- Warn metric color: #f59e0b (amber)
- Bad metric color: #ef4444 (red)
- Section title style: blue left border (4px solid #3b82f6), padding-left 12px, font-size 18px bold
- Body padding: 32px max-width 1200px margin auto

PRINT STYLES (required @media print block):
- body background: white, color: #111
- All cards: background white, border: 1px solid #ddd
- Remove all buttons and interactive elements
- page-break-inside: avoid on cards
- Major sections: page-break-before: always
- Font sizes slightly smaller

BUILD THESE SECTIONS EXACTLY IN THIS ORDER:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1: COVER HEADER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Full-width dark gradient banner. Contains:
- Top-left: "BLUDASH" in large bold white + subtitle "Meta Ads Intelligence Report"
- Center: Client name (from payload.meta.client) large, date range below it
- Top-right: Health Score circle badge — large number X/10, label below it
  - Circle color: emerald if score>=7, amber if >=4, red if <4
- Bottom strip (dark, full width): 6 metric pills in a row:
  Total Spend ₹X | Total Reach X | Total Leads X | CTR X% | CPL ₹X | Active Ads X/X

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2: EXECUTIVE SUMMARY + ACCOUNT DIAGNOSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Full-width card: executive summary paragraph (from reportData.executiveSummary)
- 2-col grid below:
  Left card (red left border 4px): "🚨 Biggest Problem" — reportData.accountDiagnosis.biggestProblem
  Right card (emerald left border 4px): "💡 Biggest Opportunity" — reportData.accountDiagnosis.biggestOpportunity
- 2 progress bars:
  "Spend Efficiency Score" — parse the number from reportData.accountDiagnosis.spendEfficiencyScore
  "Creative Health Score" — parse the number from reportData.accountDiagnosis.creativeHealthScore
  Show bar filled to that percentage, colored emerald/amber/red based on value

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3: KEY TAKEAWAYS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Numbered cards 1-5. Each card: large number on left (blue), takeaway text on right.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4: PERFORMANCE METRICS GRID
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4-column grid of metric cards. Each card shows: label (small caps muted), value (large bold), colored dot indicator.
Metrics: Total Spend, Total Reach, Total Impressions, Total Clicks, CTR (flag colored), CPM (flag colored), CPC (flag colored), Total Leads (emerald), CPL (flag colored), Active Ads, Paused Ads, Campaigns, Ad Sets, Avg CTR, Avg CPM, Avg CPC

Below that: engagement stats in a single horizontal row card:
Likes | Comments | Shares | Video Views | LP Views | Post Engagements

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5: CREATIVE DEEP DIVE ← MAKE THIS THE MOST PROMINENT SECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Large section header with star icon ★

TOP PERFORMER card (thick emerald border 2px, emerald glow shadow):
- Header bar: "🏆 TOP PERFORMER" badge + ad name large bold
- "WHY IT WORKS" subsection: paragraph from reportData.creativeDeepDive.topPerformer.whyItWorks
- Metrics row: CTR, CPL, Leads, Video View Rate, Engagement Rate — each in a colored pill
- "WHAT TO REPLICATE" callout box (emerald bg tinted): reportData.creativeDeepDive.topPerformer.whatToReplicate

WORST PERFORMER card (thick red border 2px, red glow shadow):
- Header bar: "💸 BUDGET DRAIN" badge + ad name large bold
- "WHY IT FAILS — CREATIVE AUTOPSY" subsection: paragraph from reportData.creativeDeepDive.worstPerformer.whyItFails
- Metrics row: CTR, CPL, Spend Wasted — each in red pills
- "CREATIVE BRIEF — WHAT TO BUILD INSTEAD" callout box (red bg tinted): reportData.creativeDeepDive.worstPerformer.whatToChange

CREATIVE RANKINGS TABLE:
Columns: Rank | Ad Name | Verdict | CTR | CPL | Leads | Spend | Diagnosis
Row background alternating. CTR/CPL colored by performance.
Sortable by clicking column headers (vanilla JS).

FORMAT ANALYSIS card (2-col):
Left: Video performance summary | Right: Static performance summary
From reportData.creativeDeepDive.formatAnalysis

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6: WHAT'S WORKING (emerald theme)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each item in reportData.whatIsWorking:
Card with emerald left border. Title badge. "WHY IT WORKS" paragraph (whyItWorks field).
Evidence metrics in small pills. Scaling recommendation. Scaling potential tag (High=emerald, Medium=amber, Low=slate).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7: WHAT'S NOT WORKING (red theme)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each item in reportData.whatIsNotWorking:
Card with red left border. Title badge. "WHY IT FAILS" paragraph (whyItFails field).
Evidence. Fix recommendation. Verdict badge: "Pause Immediately"=red, "Needs Creative Fix"=amber, "Needs Audience Fix"=blue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8: CAMPAIGN ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each campaign in reportData.campaignAnalysis:
Card. Top row: campaign name + verdict badge (colored) + urgency tag.
Stats row: Spend% | Leads% | Efficiency vs average — in small stat boxes.
Root cause paragraph. Action callout box (blue tinted).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 9: BUDGET OPTIMIZATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Wasted spend callout (red, large number prominent).
Summary paragraph.
Action cards: each shows action → reason → expected impact in a 3-part horizontal layout.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 10: AUDIENCE & TARGETING + LEADS ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2-col layout: Audience left, Leads right.
Audience: observations, high-performing vs failing audiences, recommendations list.
Leads: total leads stat, CPL stat, best/worst source, recommendations list.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 11: PRIORITIZED ACTIONS ← MAKE VISUALLY BOLD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sort by priority ascending (1 = most urgent).
Each action card:
- Left: large priority circle (1-3=red filled, 4-6=amber, 7+=slate)
- Center: action title bold large, reason paragraph muted, expected result in emerald bold
- Right column: effort badge + time-to-impact badge stacked
Cards should have a slight left-to-right gradient based on urgency.

QUICK WINS section below: compact emerald cards, action + how-to.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 12: 30-DAY EXECUTION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4-column layout, one column per week.
Each column: week header (blue gradient), focus theme, goal, tasks as checklist items.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 13: COMPLETE AD DATA TABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Full-width table. All ads from payload.ads array.
Columns: # | Ad Name | Campaign | Status | Spend | Reach | Impressions | Clicks | CTR | CPM | CPC | Leads | CPL | Eng%
- CTR: ≥1.5% emerald, ≥0.8% amber, <0.8% red
- CPL: ≤100 emerald, ≤300 amber, >300 or 0 red
- Status badge: ACTIVE=emerald, PAUSED=amber, ARCHIVED=slate
- Alternating rows
- Sticky header (position: sticky top: 0)
- Sortable columns with JS (click header → sort asc/desc)
- Search box above table to filter by ad name

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 14: FOOTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dark footer: "Bludash · ${payload.meta.client} · ${payload.meta.from} to ${payload.meta.to} · Generated ${new Date().toLocaleDateString()}"
Print button (hidden on print): calls window.print()

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ANALYSIS DATA (from Manus deep analysis):
${JSON.stringify(reportData, null, 2)}

RAW PERFORMANCE DATA:
${JSON.stringify(payload, null, 2)}

REMINDER: Return ONLY raw HTML starting with <!DOCTYPE html>. Nothing else whatsoever.`;
}

export async function POST(req: NextRequest) {
  const manusApiKey = process.env.MANUS_API_KEY;
  if (!manusApiKey) {
    return NextResponse.json({ error: "MANUS_API_KEY is not configured" }, { status: 500 });
  }

  let payload: ReportPayload;
  let reportData: any;

  try {
    const body = await req.json();
    payload = body.payload;
    reportData = body.reportData;
    if (!payload || !reportData) throw new Error("Missing payload or reportData");
  } catch (err: any) {
    return NextResponse.json({ error: `Invalid request body: ${err.message}` }, { status: 400 });
  }

  try {
    // Create Manus task to generate HTML report
    const createRes = await fetch(`${MANUS_BASE}/task.create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": manusApiKey,
      },
      body: JSON.stringify({
        message: {
          content: buildHTMLPrompt(payload, reportData),
        },
      }),
    });

    const createText = await createRes.text();
    let createData: any = {};
    try {
      createData = JSON.parse(createText);
    } catch {
      console.error("Non-JSON from Manus html task.create:", createText.slice(0, 500));
      return NextResponse.json({ error: "Manus returned non-JSON on task create" }, { status: 500 });
    }

    if (!createRes.ok) {
      return NextResponse.json(
        { error: createData?.error?.message ?? `Manus error (${createRes.status})` },
        { status: createRes.status }
      );
    }

    const taskId: string = createData.task_id ?? createData.id ?? "";
    if (!taskId) {
      return NextResponse.json({ error: "Manus did not return a task ID for HTML task" }, { status: 500 });
    }

    return NextResponse.json({ taskId });
  } catch (err: any) {
    console.error("manus-html unhandled error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}