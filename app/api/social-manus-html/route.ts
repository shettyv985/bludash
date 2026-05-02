// app/api/social-manus-html/route.ts
// DROP-IN REPLACEMENT — only buildHTMLPrompt changes, everything else stays the same.

import { NextRequest, NextResponse } from "next/server";
import type { SocialReportPayload } from "@/lib/buildSocialReportPayload";

const MANUS_BASE = "https://api.manus.ai/v2";

// ─── TRIMMED PAYLOAD BUILDER ──────────────────────────────────────────────────
// Strips the full 150-post array so Manus doesn't hit context limits.
// Keeps only what the HTML renderer actually needs.
function buildHtmlPayload(payload: SocialReportPayload) {
  return {
    meta: payload.meta,
    summary: payload.summary,
    benchmarks: payload.benchmarks,
    comparison: payload.comparison,
    contentMix: payload.contentMix,
    redFlags: payload.redFlags.slice(0, 12),   // top 12 most critical
    positives: payload.positives.slice(0, 8),  // top 8 highlights
    rankings: {
      fbTopEngagement: payload.rankings.fbTopEngagement,
      fbTopReach: payload.rankings.fbTopReach,
      fbTopLikes: payload.rankings.fbTopLikes,
      fbWorstEngagement: payload.rankings.fbWorstEngagement,
      igTopEngagement: payload.rankings.igTopEngagement,
      igTopReach: payload.rankings.igTopReach,
      igTopLikes: payload.rankings.igTopLikes,
      igTopSaves: payload.rankings.igTopSaves,
      igWorstEngagement: payload.rankings.igWorstEngagement,
      igTopReels: payload.rankings.igTopReels,
      igBestWatchTime: payload.rankings.igBestWatchTime,
      igWorstSkipRate: payload.rankings.igWorstSkipRate,
      igBestSkipRate: payload.rankings.igBestSkipRate,
      boostedPosts: payload.rankings.boostedPosts.slice(0, 10),
      highSpendLowEngagement: payload.rankings.highSpendLowEngagement,
    },
  };
}

// ─── MAIN PROMPT BUILDER ─────────────────────────────────────────────────────
function buildHTMLPrompt(payload: SocialReportPayload, reportData: any): string {
  const hp = buildHtmlPayload(payload);

  return `You are a world-class frontend developer AND senior social media strategist. Your ONLY job is to write a single, complete, self-contained HTML file as your entire response.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ CRITICAL OUTPUT RULES — VIOLATING ANY = TASK FAILURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Your ENTIRE response = raw HTML. Nothing else. Not one word outside the HTML tags.
2. First character = "<" of "<!DOCTYPE html>". Last character = ">" of "</html>".
3. Do NOT save to file. Do NOT upload. Do NOT describe what you made.
4. Zero markdown. Zero code fences. Zero explanation. Zero preamble.
5. Every section MUST be rendered — no skipping, no placeholders.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ CONTENT QUALITY MANDATE — THIS IS THE MOST IMPORTANT RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is a PREMIUM paid client report. Generic, vague, or surface-level content is UNACCEPTABLE.

EVERY insight must follow this formula:
  WHAT happened → exact metric (e.g. "13% engagement rate")
  WHY it happened → psychological/strategic root cause (e.g. "national pride trigger + real-time marketing")
  PROOF → reference the specific post caption (first 60 chars)
  ACTION → concrete next step with expected measurable outcome

BANNED phrases (using any = failure):
  "engagement is low" → must say WHY it's low and WHICH posts prove it
  "content is not resonating" → must say WHAT specifically is failing and WHY
  "consider improving" → must say EXACTLY what to do, HOW, and WHEN
  "overall performance" → must specify FB or IG, which metric, which posts
  "good/bad content" → must explain the psychological mechanism

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESIGN SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Page bg: #0a0f1e | Card bg: #111827 | Card border: 1px solid rgba(255,255,255,0.07)
Card radius: 12px | Body: max-width 1200px, margin auto, padding 32px
FB accent: #1877f2 | IG accent: #833ab4 | Emerald: #10b981 | Red: #ef4444 | Amber: #f59e0b
Text primary: #f1f5f9 | Text muted: #94a3b8 | Text dimmed: #475569
Header gradient: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)
Section title: left border 4px solid (fb=blue, ig=purple, good=emerald, bad=red), padding-left 12px, font-size 18px bold
Engagement color rules: ≥3% = #10b981 | ≥1% = #f59e0b | <1% = #ef4444
Skip rate color rules: ≤25% = #10b981 | ≤50% = #f59e0b | >50% = #ef4444

@media print:
  body bg white, color #111 | cards bg white, border 1px #ddd
  page-break-inside: avoid on cards | major sections: page-break-before: always
  hide all buttons | font sizes slightly smaller

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD ALL 17 SECTIONS IN EXACT ORDER BELOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━ SECTION 1: COVER HEADER ━━
Full-width gradient banner.
- Top-left: "BLUDASH" in large bold white + subtitle "Social Media Intelligence Report"  
- Center: Client name large (from meta.client), platform badge, date range (meta.from to meta.to)
- Top-right: Health Score circle — score from reportData.overallHealthScore.score, color: ≥7=emerald, ≥4=amber, <4=red. Show "X/10" and the label.
- Bottom pill strip (dark, full-width): FB Posts ${hp.summary.fbPostCount} | IG Posts ${hp.summary.igPostCount} | FB Reach ${hp.summary.fbTotalReach.toLocaleString()} | IG Reach ${hp.summary.igTotalReach.toLocaleString()} | Net FB ${hp.summary.fbNetFollows >= 0 ? '+' : ''}${hp.summary.fbNetFollows} | Net IG +${hp.summary.igNetFollows} | Total Spend ₹${(hp.summary.fbTotalAdSpend + hp.summary.igTotalAdSpend).toFixed(0)}

━━ SECTION 2: EXECUTIVE SUMMARY + ACCOUNT DIAGNOSIS ━━
- Full-width card with header "Executive Summary". Render reportData.executiveSummary verbatim in full. Do NOT shorten it.
- 2-col grid below:
  Left (red left border, red tint bg): "🚨 Biggest Problem This Month" — render reportData.accountDiagnosis.biggestProblem in full. Below it, show the EXACT posts/metrics that prove it from the data. Make it visceral and specific.
  Right (emerald left border, emerald tint bg): "💡 Biggest Opportunity" — render reportData.accountDiagnosis.biggestOpportunity in full. Below it, show the specific posts that hint at what could work.
- 2 animated progress bars (CSS animation, fills on load):
  "Content Health Score" — parse number from reportData.accountDiagnosis.contentHealthScore. E.g. "18/100" → fill to 18%. Color: <40=red, <70=amber, ≥70=emerald.
  "Audience Growth Score" — parse number from reportData.accountDiagnosis.audienceGrowthScore.

━━ SECTION 3: KEY TAKEAWAYS ━━
5 numbered cards in a grid (2+2+1 layout). Each card:
- Large number (01–05) in accent color, left side
- Takeaway text from reportData.keyTakeaways[i] — render IN FULL, do not truncate
- Below each takeaway: a one-line "What to do about it:" in amber, specific and actionable
Cards should be visually distinct with a subtle gradient bg.

━━ SECTION 4: PERIOD COMPARISON (MoM) ━━
Check hp.comparison.available. If false: muted card "No comparison period data available."

If true:
- Section header with large trend badge: trend from reportData.periodComparison.trend (Improving=emerald, Declining=red, Mixed=amber, Stable=slate)
- Large headline from reportData.periodComparison.headline
- Amber insight card below: render reportData.periodComparison.keyInsight in full — this MUST explain the "Boosted Inflation" phenomenon or whatever the core MoM story is
- 3-col metric change grid. For EACH metric in hp.comparison.metrics (all 13):
  Card shows: metric name | current value large bold | "prev: X" small muted | change pill (▲ +X% emerald if up, ▼ -X% red if down, — flat slate)
  Color-code the current value: if trend=up and metric is good news → emerald; if trend=down → red
- 2-col improvements vs declines list:
  Left (emerald bullets): render reportData.periodComparison.improvements — each as full sentence with exact numbers
  Right (red bullets): render reportData.periodComparison.declines — each as full sentence with exact numbers

━━ SECTION 5: PERFORMANCE METRICS GRID ━━
Two subsections.

FACEBOOK (blue header, blue accent cards):
4-col responsive grid showing ALL of these metrics as individual stat cards:
Posts: ${hp.summary.fbPostCount} | Reach: ${hp.summary.fbTotalReach.toLocaleString()} (below: organic ${hp.summary.fbOrganicReach.toLocaleString()} / paid ${hp.summary.fbPaidReach.toLocaleString()}) | Likes: ${hp.summary.fbOrganicLikes} | Comments: ${hp.summary.fbOrganicComments} | Shares: ${hp.summary.fbOrganicShares} | Follows: ${hp.summary.fbFollows} | Unfollows: ${hp.summary.fbUnfollows} | Net Followers: ${hp.summary.fbNetFollows} (color red if negative) | Page Views: ${hp.summary.fbPageViews.toLocaleString()} | Boosted Posts: ${hp.summary.fbBoostedPostCount} | Total Ad Spend: ₹${hp.summary.fbTotalAdSpend.toFixed(2)} | Avg Engagement Rate: ${hp.summary.avgFbEngagementRate}% (color by rule)
Below the grid: a "What this means" insight card explaining FB's numbers in plain language with specific diagnosis.

INSTAGRAM (purple header, purple accent cards):
Posts: ${hp.summary.igPostCount} | Total Reach: ${hp.summary.igTotalReach.toLocaleString()} (organic ${hp.summary.igOrganicReach.toLocaleString()} / paid ${hp.summary.igPaidReach.toLocaleString()}) | Total Likes: ${hp.summary.igTotalLikes.toLocaleString()} (organic ${hp.summary.igOrganicLikes} / paid ${hp.summary.igPaidLikes.toLocaleString()}) | Comments: ${hp.summary.igTotalComments} | Shares: ${hp.summary.igTotalShares} | Saves: ${hp.summary.igOrganicSaves} | Follows: ${hp.summary.igFollows} | Unfollows: ${hp.summary.igUnfollows} | Net Followers: +${hp.summary.igNetFollows} | Profile Views: ${hp.summary.igProfileViews.toLocaleString()} | Boosted Posts: ${hp.summary.igBoostedPostCount} | Ad Spend: ₹${hp.summary.igTotalAdSpend.toFixed(2)} | Avg ER: ${hp.summary.avgIgEngagementRate}% | Reels: ${hp.summary.igReelCount} | Carousels: ${hp.summary.igCarouselCount} | Images: ${hp.summary.igImageCount} | Avg Reel Watch: ${hp.summary.avgIgReelWatchTime ?? '—'}s | Avg Skip Rate: ${hp.summary.avgIgReelSkipRate ?? '—'}% (color by threshold)
Below: "What this means" insight card with specific IG diagnosis.

━━ SECTION 6: REEL HOOK ANALYSIS ━━
Only if reportData.reelHookAnalysis.available === true. Otherwise muted card.

When available:
- Section header with large hook quality badge (Excellent=emerald, Good=blue, Moderate=amber, Poor=red). The badge should be prominent — this is a KEY metric.
- Row of 4 stat cards: Avg Skip Rate (large, colored by threshold) | Avg Watch Time | Hook Quality Rating | Number of Reels Analyzed
- VISUAL SKIP RATE SCALE BAR:
  A horizontal bar 0–100%. Marker at 25% labeled "✓ Good" in emerald. Marker at 50% labeled "⚠ Ok" in amber. A pulsing dot/pointer at the actual avg skip rate position with a label. Fill the bar with a gradient (emerald→amber→red).
- 2-col best/worst hook cards:
  LEFT (emerald border, emerald glow): "🎣 Best Hook This Month"
    Caption in bold | Skip Rate badge | Avg Watch badge
    "Why viewers STAYED:" — render reportData.reelHookAnalysis.bestHook.whyItWorks in FULL. Explain the psychological mechanism. What in the first 3 seconds kept them watching.
    "Replicate This:" — 3 specific bullet points on how to apply this hook formula to future reels
  RIGHT (red border, red glow): "💀 Worst Hook This Month"  
    Caption in bold | Skip Rate badge (red) | Avg Watch badge (red)
    "Why viewers SKIPPED:" — render reportData.reelHookAnalysis.worstHook.whyItFails in FULL. What specifically in the opening 3 seconds triggered the skip reflex.
    "Never Do This Again:" — 3 specific bullet points on what to eliminate
- Hook Improvement Plan in amber-tinted card:
  "3-Step Hook Fix Plan" header. Render reportData.reelHookAnalysis.hookImprovementPlan parsed into 3 numbered steps. Each step should have a title, explanation, and expected impact.
- Per-reel breakdown table:
  Columns: # | Caption (50 chars) | Reach | Eng Rate (colored pill) | Avg Watch (purple) | Skip Rate (colored pill) | Verdict
  Sorted by skip rate ascending (best hooks first — lowest skip = best hook retention)
  Verdict column: <74% skip = "Strong Hook" emerald | 74–80% = "Weak Hook" amber | >80% = "Kill This Format" red
  Include ALL reels from hp.rankings.igTopReels and hp.rankings.igWorstSkipRate (deduplicated)

━━ SECTION 7: CONTENT DEEP DIVE ━━
This is the MOST PROMINENT section. Large "★ Content Deep Dive" header.

TOP PERFORMER CARD (2px emerald border, box-shadow: 0 0 40px rgba(16,185,129,0.2)):
- Header row: Platform badge (blue=FB, purple gradient=IG) + Post Type badge + "🏆 TOP PERFORMER THIS MONTH"
- Caption: first 100 chars in large bold (from reportData.contentDeepDive.topPerformer.postCaption)
- "WHY IT WORKED — THE FULL BREAKDOWN" heading:
  Render reportData.contentDeepDive.topPerformer.whyItWorks in FULL — do not shorten.
  Below this, add a "The Formula" box in emerald tint: extract 3–4 replicable elements from the analysis (e.g. "Real-time cultural moment", "National emotion trigger", "High-contrast visual", "Share-worthy framing")
- Metrics row: colored pills for Engagement Rate | Reach | Likes | Saves | Watch Time | CTR (if boosted)
- "WHAT TO REPLICATE NEXT WEEK" callout box (emerald bg, prominent):
  Render reportData.contentDeepDive.topPerformer.whatToReplicate in full.
  Below: "Content Brief:" — 3 specific bullet points giving exact instructions for the next post that mimics this success

WORST PERFORMER CARD (2px red border, box-shadow: 0 0 40px rgba(239,68,68,0.2)):
- Header: Platform badge + "💸 BIGGEST CONTENT DRAIN"
- Caption in bold
- "WHY IT FAILED — CONTENT AUTOPSY" heading:
  Render reportData.contentDeepDive.worstPerformer.whyItFails in FULL.
  Add "The Failure Chain" box in red tint: trace the exact chain of events (e.g. "Generic hook → algorithm shows to cold audience → 0% engagement → algorithm penalizes future organic reach")
- Red metrics pills
- "KILL IT & REPLACE WITH THIS" callout (red tint bg):
  Render reportData.contentDeepDive.worstPerformer.whatToChange in full.
  "Replacement Brief:" — 3 specific bullet points for what to post instead

CONTENT RANKINGS TABLE:
Search box above. Sortable columns via vanilla JS click-to-sort.
Columns: Rank | Platform badge | Type badge | Caption (60 chars) | Eng Rate (colored pill) | Reach | Likes | Skip Rate (colored or —) | Avg Watch | Boosted (amber badge or —) | Diagnosis
Render ALL entries from reportData.contentDeepDive.contentRankings.
Diagnosis column: render the 2-sentence diagnosis from Manus — DO NOT TRUNCATE.
Sticky header. Zebra striping. Hover highlight.

FORMAT ANALYSIS — 2-col card (side by side):
Left (FB): render reportData.contentDeepDive.formatAnalysis.fbBestFormat in FULL with a "Recommended Weekly Mix" section showing specific counts.
Right (IG): render reportData.contentDeepDive.formatAnalysis.igBestFormat in FULL with recommended weekly mix.
Below: 2-col — Reel Analysis card (purple) and Carousel Analysis card (blue).
  Reel card: render reportData.contentDeepDive.formatAnalysis.reelAnalysis in FULL. Include avg watch time ${hp.summary.avgIgReelWatchTime}s and avg skip rate ${hp.summary.avgIgReelSkipRate}%.
  Carousel card: render reportData.contentDeepDive.formatAnalysis.carouselAnalysis in FULL.
Below: recommendations from reportData.contentDeepDive.formatAnalysis.recommendations as 3 action cards.

━━ SECTION 8: WHAT'S WORKING ━━
Section header "✅ What's Working — Scale These Immediately" with emerald accent.
For EACH item in reportData.whatIsWorking:
Card with 2px emerald left border, slight emerald tint bg:
  Platform badge | "✅ WORKING" tag
  Point title in large bold
  "Why It Works (The Psychological Mechanism):" — render whyItWorks in FULL. Must explain the specific reason this content type succeeds — algorithm behavior, emotional triggers, audience psychology.
  Evidence pills row: render evidence as individual metric pills
  "How to Scale This:" render recommendation in FULL — specific, actionable, includes expected metric outcomes
  Scaling Potential badge: High=emerald, Medium=amber, Low=slate with explanation of WHY that scaling potential rating

━━ SECTION 9: WHAT'S NOT WORKING ━━
Section header "❌ What's Not Working — Stop or Fix These Now" with red accent.
For EACH item in reportData.whatIsNotWorking:
Card with 2px red left border, slight red tint bg:
  Platform badge | Verdict badge (color-coded: Stop=red, Fix=amber, Wrong Platform=purple)
  Point title in large bold
  "Why It's Failing (Root Cause Analysis):" — render whyItFails in FULL. The root cause must be specific — is it the hook? The format? The caption style? The audience targeting? The posting time? Algorithm penalty from previous bad performance?
  Evidence pills row in red
  "The Fix:" render recommendation in FULL with specific steps
  "If You Don't Fix This:" — one sentence on the downstream consequence of ignoring this

━━ SECTION 10: PLATFORM COMPARISON ━━
2-col side-by-side card.
LEFT (blue theme, FB):
  Header "Facebook" with FB logo circle
  Avg ER big number: ${hp.summary.avgFbEngagementRate}% (colored) | Top Format | Net Followers ${hp.summary.fbNetFollows} (red) | Ad Spend ₹${hp.summary.fbTotalAdSpend.toFixed(0)}
  Key Insight: render reportData.platformComparison.fbVsIg — the FB-specific portion
  Top 3 FB Recommendations: render reportData.platformComparison.platformRecommendations.fb as 3 numbered action cards
RIGHT (purple theme, IG):
  Avg ER: ${hp.summary.avgIgEngagementRate}% | Net Followers +${hp.summary.igNetFollows} | Ad Spend ₹${hp.summary.igTotalAdSpend.toFixed(0)}
  Key Insight: IG portion of fbVsIg analysis
  Top 3 IG Recommendations: render reportData.platformComparison.platformRecommendations.ig
Below full-width: "Audience Behavior Difference" card — render reportData.platformComparison.audienceBehavior in FULL.
Below: "Cross-Posting Strategy" card (amber tint) — render reportData.platformComparison.crossPostingOpportunity in FULL.

━━ SECTION 11: BOOSTING ANALYSIS ━━
Section header with amber accent "💰 Ad Spend Analysis"
Overall assessment card (amber tint): render reportData.boostingAnalysis.overallAssessment in FULL. Include total combined spend ₹${(hp.summary.fbTotalAdSpend + hp.summary.igTotalAdSpend).toFixed(0)} and what the ROI story is.

2-col best vs worst:
LEFT (emerald): "💰 Best Boosted Post — Money Well Spent" — render bestBoostedPost in FULL. Show CTR, ER, spend, and WHY this one worked vs others.
RIGHT (red): "🔥 Worst Boosted Post — Budget Burned" — render worstBoostedPost in FULL. Show the exact waste: spend amount, reach, engagement, CTR, and the opportunity cost.

Boosting Strategy callout (amber bg, prominent): render reportData.boostingAnalysis.boostingStrategy in FULL. This should be a clear decision framework: what to boost, when to boost, what NEVER to boost.

Recommendations: render each recommendation from reportData.boostingAnalysis.recommendations as numbered action card with urgency tag.

Boosted Posts Table:
All boosted posts from hp.rankings.boostedPosts.
Columns: Caption (50 chars) | Platform | Spend | Reach | Eng Rate (colored) | CTR (colored: ≥1.5%=emerald, ≥0.5%=amber, <0.5%=red) | CPM | Verdict
Verdict: "✓ ROI Positive" emerald | "⚠ Borderline" amber | "✗ Wasted Budget" red
Logic: CTR ≥ 1% and ER ≥ 0.5% = ROI Positive | CTR ≥ 0.5% = Borderline | else = Wasted Budget

━━ SECTION 12: AUDIENCE GROWTH ANALYSIS ━━
2-col grid.
LEFT (FB blue):
  Header "Facebook Audience"
  3 big stat boxes: Follows ${hp.summary.fbFollows} | Unfollows ${hp.summary.fbUnfollows} | Net ${hp.summary.fbNetFollows} (red because negative)
  If comparison available: show previous period below each in small muted text
  "Follower Analysis:" render reportData.audienceGrowth.fbFollowerAnalysis in FULL
  Churn Risk box (red tint): render reportData.audienceGrowth.churnRisk for FB in full
RIGHT (IG purple):
  Follows ${hp.summary.igFollows} | Unfollows ${hp.summary.igUnfollows} | Net +${hp.summary.igNetFollows}
  Previous period comparison if available
  "Follower Analysis:" render reportData.audienceGrowth.igFollowerAnalysis in FULL
  Growth Drivers box (emerald tint): render reportData.audienceGrowth.growthDrivers

Full-width below: Recommendations as 3 numbered action cards — render reportData.audienceGrowth.recommendations each in FULL with specific steps.

━━ SECTION 13: CONTENT CALENDAR INSIGHTS ━━
Section header "📅 Content Calendar Recommendations"
4-col grid of insight cards:
  Posting Frequency: render reportData.contentCalendarInsights.postingFrequency in FULL
  Best Days: render reportData.contentCalendarInsights.bestPerformingDays in FULL
  Content Mix: render reportData.contentCalendarInsights.contentMixRecommendation. Show as visual pill layout (e.g. "3 Reels" purple pill + "2 Carousels" blue pill + "1 Topical" amber pill per week)
  Caption Strategy: render reportData.contentCalendarInsights.captionStrategy in FULL

━━ SECTION 14: PRIORITIZED ACTIONS ━━
Section header "🎯 Your Action Plan — Sorted by Urgency"
Sort reportData.prioritizedActions by priority (1 = most urgent).
For EACH action:
Card with left border color (priority 1–3=red, 4–6=amber, 7+=slate):
  LEFT: Large priority circle (filled red/amber/slate) with number inside
  RIGHT:
    Action title in large bold
    "Why This Matters Now:" render reason in FULL — include the exact metric or post that makes this urgent
    "Expected Result:" in emerald bold — render expectedResult in FULL
    Row of badges: Effort badge (Low=emerald, Medium=amber, High=red) + Time badge (24hrs=red urgent, 3-5 days=amber, 1-2 weeks=blue)

Quick Wins section below:
"⚡ Quick Wins — Do These Today (Under 10 Minutes Each)"
Compact emerald cards, 3-col grid.
For EACH item in reportData.quickWins:
  Action in bold | Expected Impact in emerald | "How To:" render howTo in FULL as numbered steps

━━ SECTION 15: 30-DAY EXECUTION PLAN ━━
Section header "📋 30-Day Execution Roadmap"
4-col layout (one per week). Each week card:
  Header: blue gradient, "Week X" + focus theme in large
  Goal: specific measurable goal in emerald
  Tasks: checklist (☐) for each task — render ALL tasks in FULL, no truncation
  At bottom: "Success Metric" — what number confirms this week worked

━━ SECTION 16: COMPLETE POST DATA TABLE ━━
Section header "📊 Full Post Data"
Search input + platform filter dropdown (All/FB/IG) + type filter (All/IMAGE/REEL/CAROUSEL) above table.
Sortable via vanilla JS (click column header to sort asc/desc, arrow indicator).
Sticky header.

COLUMNS: # | Platform | Type | Date | Caption (50 chars, show tooltip with full caption on hover) | Likes | Comments | Shares | Saves | Reach | Eng% | Skip Rate | Avg Watch | Boosted | Spend

Data: render ALL posts from BOTH hp.rankings.fbTopEngagement, hp.rankings.fbTopReach, hp.rankings.fbWorstEngagement, hp.rankings.igTopEngagement, hp.rankings.igTopReach, hp.rankings.igWorstEngagement, hp.rankings.igTopReels, hp.rankings.boostedPosts — deduplicated by id, sorted by engagementRate desc.

Styling:
  Platform: blue "FB" badge or purple "IG" badge
  Type: REEL=purple pill, CAROUSEL=blue pill, IMAGE=slate pill
  Eng%: ≥3% emerald pill, ≥1% amber pill, <1% red pill
  Skip Rate: ≤25% emerald, ≤50% amber, >50% red pill, "—" for non-reels
  Avg Watch: purple text for reels, "—" for others
  Boosted: amber "BOOSTED ₹X" badge or muted "—"
Zebra rows. Hover highlight.

━━ SECTION 17: FOOTER ━━
Dark footer full-width:
Left: "Bludash · ${hp.meta.client} · ${hp.meta.from} → ${hp.meta.to} · Generated ${new Date().toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}"
Right: Print button (hidden on print) calling window.print() styled as pill button

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA — USE ALL OF THIS, REFERENCE IT SPECIFICALLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MANUS DEEP ANALYSIS (use every field, render every paragraph in full):
${JSON.stringify(reportData, null, 2)}

PERFORMANCE DATA (pre-calculated rankings, summaries, comparison):
${JSON.stringify(hp, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL REMINDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY raw HTML starting with <!DOCTYPE html> and ending with </html>.
Every section must be fully rendered.
Every Manus analysis paragraph must appear in full — no truncation, no summarizing.
Every metric must be specific — exact numbers, exact post captions, exact dates.
This report must be so detailed and actionable that the client knows EXACTLY what to post tomorrow, what to stop posting, and why each decision matters.`;
}

// ─── ROUTE HANDLER (unchanged) ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const manusApiKey = process.env.MANUS_API_KEY;
  if (!manusApiKey) {
    return NextResponse.json({ error: "MANUS_API_KEY is not configured" }, { status: 500 });
  }

  let payload: SocialReportPayload;
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
    const createRes = await fetch(`${MANUS_BASE}/task.create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": manusApiKey,
      },
      body: JSON.stringify({
        message: { content: buildHTMLPrompt(payload, reportData) },
      }),
    });

    const createText = await createRes.text();
    let createData: any = {};
    try {
      createData = JSON.parse(createText);
    } catch {
      console.error("Non-JSON from Manus social-html task.create:", createText.slice(0, 500));
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
    console.error("social-manus-html unhandled error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}