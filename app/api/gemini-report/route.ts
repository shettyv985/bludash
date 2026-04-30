// app/api/gemini-report/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { ReportPayload } from "@/lib/buildReportPayload";

function buildGeminiPrompt(payload: ReportPayload, reportData: any): string {
  return `You are an expert data visualization engineer and Meta Ads analyst. Generate a complete, beautiful, single-page HTML report.

CRITICAL RULES:
1. Return ONLY raw HTML. No markdown, no code fences, no explanation.
2. Start with <!DOCTYPE html> and end with </html>
3. All CSS must be inline in a <style> tag in <head>. No external CSS files.
4. No external fonts from Google Fonts or any CDN — use system fonts only: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
5. No external JavaScript libraries. Vanilla JS only, inline in <script> tags.
6. All data must be rendered from the JSON provided — do not invent numbers.
7. The report must be print-ready: use @media print CSS to hide interactive elements and ensure clean page breaks.
8. Design must be premium, agency-quality — like a McKinsey/Bain slide deck converted to HTML.

DESIGN SYSTEM:
- Background: #0a0f1e (deep navy)
- Card background: #111827
- Accent blue: #3b82f6
- Accent emerald: #10b981
- Accent red: #ef4444
- Accent amber: #f59e0b
- Text primary: #f1f5f9
- Text muted: #94a3b8
- Border: rgba(255,255,255,0.08)
- Use gradient headers: linear-gradient(135deg, #1e3a8a, #1e40af)
- Health score colors: ≥7 emerald, ≥4 amber, <4 red
- Verdict colors: "Performing Well" emerald, "Needs Attention" amber, "Underperforming" red, "Burn Risk" red

REQUIRED SECTIONS (render ALL of these in order):

1. COVER HEADER
   - Dark navy gradient background spanning full width
   - Agency logo text "BLUDASH" large bold
   - Report title "Meta Ads Performance Intelligence Report"
   - Client name, date range, generation date
   - Large health score badge (circle) with score/10 and label, colored by score
   - 6-metric strip: Total Spend, Total Reach, Total Leads, CTR, CPL, Active Ads

2. EXECUTIVE SUMMARY + ACCOUNT DIAGNOSIS
   - Full-width card with executive summary text
   - 2-column grid: Biggest Problem (red left border) + Biggest Opportunity (emerald left border)
   - Spend efficiency score and creative health score as progress bars

3. KEY TAKEAWAYS
   - Numbered list (1-5), each with a bold statement and metric badge

4. PERFORMANCE METRICS GRID
   - 4-column grid of metric cards showing ALL summary stats
   - Each card: label, value, flag indicator (colored dot: green/amber/red)
   - Engagement row: Likes, Comments, Shares, Video Views, LP Views, Engagements

5. CREATIVE DEEP DIVE (most important section — make it prominent)
   - Large section header
   - TOP PERFORMER card (emerald border): Ad name, "WHY IT WORKS" paragraph, all key metrics, "WHAT TO REPLICATE" callout box
   - WORST PERFORMER card (red border): Ad name, "WHY IT FAILS" paragraph (creative autopsy), metrics wasted, "WHAT TO CHANGE" creative brief
   - Creative Rankings table: rank, ad name, verdict, CTR, CPL, leads, spend, diagnosis
   - Format Analysis: Video vs Static comparison

6. WHAT'S WORKING (emerald theme)
   - Each item: title badge, "WHY IT WORKS" paragraph, evidence metrics row, scaling recommendation, scaling potential tag

7. WHAT'S NOT WORKING (red theme)
   - Each item: title badge, "WHY IT FAILS" deep diagnosis, evidence, recommendation, verdict badge (Pause/Fix Creative/Fix Audience)

8. CAMPAIGN ANALYSIS
   - One card per campaign with: name, verdict badge (colored), spend%, leads%, efficiency vs account average
   - Root cause analysis paragraph
   - Action button-style CTA with urgency tag

9. BUDGET OPTIMIZATION
   - Current allocation assessment
   - Wasted spend highlight (red callout)
   - Action cards: each with action, reason, expected impact

10. AUDIENCE & TARGETING
    - Observations paragraph
    - High performing vs failing audiences in 2-column layout
    - Recommendations as numbered list

11. LEADS ANALYSIS
    - Total leads, CPL, best/worst source
    - Observations and recommendations

12. PRIORITIZED ACTIONS (make this visually standout)
    - Priority number in colored circle (1-3 red, 4-6 amber, 7-10 slate)
    - Action title bold
    - Reason with exact data reference
    - Expected result in emerald
    - Effort tag + Time to Impact tag
    - Sort by priority ascending

13. QUICK WINS
    - Green callout cards for immediate actions

14. 30-DAY EXECUTION PLAN
    - 4-column week layout
    - Each week: header with week number + focus theme + goal
    - Tasks as checkboxes (visual only, not interactive for print)

15. FULL AD DATA TABLE
    - All ads from payload.ads
    - Columns: Ad Name, Campaign, Status, Spend, Reach, Impr, Clicks, CTR, CPM, CPC, Leads, CPL
    - CTR colored: ≥1.5% emerald, ≥0.8% amber, <0.8% red
    - CPL colored: ≤₹100 emerald, ≤₹300 amber, >₹300 red
    - Sortable columns header (add sort arrows visually, make them clickable with JS)
    - Alternating row background

PRINT STYLES:
- @media print: white background, black text, remove nav/buttons, ensure tables don't break awkwardly
- Each major section should try to start on a new page: use page-break-before: always on section headers
- Reduce font sizes slightly for print

HERE IS THE ANALYSIS DATA (from Manus AI):
${JSON.stringify(reportData, null, 2)}

HERE IS THE RAW PERFORMANCE DATA:
${JSON.stringify(payload, null, 2)}

Remember: Return ONLY the raw HTML document. Nothing else.`;
}

export async function POST(req: NextRequest) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
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
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: buildGeminiPrompt(payload, reportData) }],
            },
          ],
          generationConfig: {
            thinkingConfig: { thinkingBudget: -1 },
            maxOutputTokens: 65536,
            temperature: 0.3,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API error:", res.status, errText.slice(0, 500));
      return NextResponse.json(
        { error: `Gemini API error (${res.status}): ${errText.slice(0, 200)}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const rawText: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!rawText) {
      console.error("Gemini returned empty response:", JSON.stringify(data).slice(0, 500));
      return NextResponse.json({ error: "Gemini returned an empty response" }, { status: 500 });
    }

    // Strip any accidental markdown code fences
    const html = rawText
      .replace(/^```html\s*/im, "")
      .replace(/^```\s*/im, "")
      .replace(/\s*```\s*$/im, "")
      .trim();

    return NextResponse.json({ html });
  } catch (err: any) {
    console.error("gemini-report unhandled error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}