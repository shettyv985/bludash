type ReportMode = "ads" | "social";

type ReportOptions = {
  mode: ReportMode;
  payload: unknown;
  reportData: unknown;
  model: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function escapeHTML(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function text(value: unknown, fallback = "Not available") {
  const clean = String(value ?? "").trim();
  return clean ? escapeHTML(clean) : fallback;
}

function numberValue(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatNumber(value: unknown, digits = 0) {
  const num = numberValue(value);
  return num.toLocaleString("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatCurrency(value: unknown) {
  return `Rs ${formatNumber(value, 0)}`;
}

function formatPercent(value: unknown) {
  return `${formatNumber(value, 2)}%`;
}

function firstString(record: Record<string, unknown>, keys: string[], fallback = "Not available") {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function hasContent(value: unknown) {
  if (Array.isArray(value)) return value.some(hasContent);
  if (isRecord(value)) return Object.values(value).some(hasContent);
  if (typeof value === "number") return Number.isFinite(value);
  return String(value ?? "").trim().length > 0;
}

function valueToText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(valueToText).filter(Boolean).join("; ");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, entry]) => hasContent(entry))
      .map(([key, entry]) => `${labelize(key)}: ${valueToText(entry)}`)
      .filter(Boolean)
      .join("; ");
  }
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function clipped(value: unknown, max = 220, fallback = "Not available") {
  const clean = valueToText(value);
  if (!clean) return fallback;
  const shortened = clean.length > max ? `${clean.slice(0, Math.max(0, max - 3)).trim()}...` : clean;
  return escapeHTML(shortened);
}

function pickValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (hasContent(value)) return value;
  }
  return undefined;
}

function metricCard(label: string, value: unknown, tone = "") {
  return `<div class="metric ${tone}">
    <span>${escapeHTML(label)}</span>
    <strong>${escapeHTML(value)}</strong>
  </div>`;
}

function paragraph(value: unknown, max = 260) {
  return `<p>${clipped(value, max)}</p>`;
}

function list(items: unknown[], empty = "No items available.", maxItems = 7, itemMax = 180): string {
  if (!items.length) return `<p class="muted">${escapeHTML(empty)}</p>`;

  return `<ul class="compact-list">${items
    .slice(0, maxItems)
    .map((item) => {
      return `<li>${clipped(item, itemMax)}</li>`;
    })
    .join("")}</ul>${items.length > maxItems ? `<p class="muted more-note">+${items.length - maxItems} more in the source data</p>` : ""}`;
}

function labelize(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function section(title: string, body: string, className = "") {
  return `<section class="${className}">
    <h2>${escapeHTML(title)}</h2>
    ${body}
  </section>`;
}

type InsightCardConfig = {
  titleKeys: string[];
  evidenceKeys?: string[];
  whyKeys?: string[];
  fixKeys?: string[];
  logicKeys?: string[];
  evidenceLabel?: string;
  whyLabel?: string;
  fixLabel?: string;
  logicLabel?: string;
  fallbackTitle?: string;
  maxItems?: number;
  tone?: "green" | "red" | "amber";
};

function fieldBlock(label: string, value: unknown, className = "", max = 190) {
  if (!hasContent(value)) return "";
  const body = Array.isArray(value)
    ? list(value.filter(hasContent), "No items available.", 4, 150)
    : `<p>${clipped(value, max, "")}</p>`;
  return `<div class="insight-block ${className}">
    <span>${escapeHTML(label)}</span>
    ${body}
  </div>`;
}

function fallbackBlocks(record: Record<string, unknown>, skipKeys: Set<string>) {
  return Object.entries(record)
    .filter(([key, value]) => !skipKeys.has(key) && hasContent(value))
    .slice(0, 4)
    .map(([key, value]) => fieldBlock(labelize(key), value))
    .join("");
}

function insightCard(item: unknown, config: InsightCardConfig) {
  if (!isRecord(item)) {
    return `<article class="insight-card ${config.tone ?? ""}">
      <h3>${escapeHTML(config.fallbackTitle ?? "Action")}</h3>
      <div class="insight-grid">${fieldBlock(config.fixLabel ?? "What to do", item, "", 260)}</div>
    </article>`;
  }

  const skipKeys = new Set([
    ...config.titleKeys,
    ...(config.evidenceKeys ?? []),
    ...(config.whyKeys ?? []),
    ...(config.fixKeys ?? []),
    ...(config.logicKeys ?? []),
  ]);
  const title = firstString(item, config.titleKeys, config.fallbackTitle ?? "Insight");
  const blocks =
    fieldBlock(config.evidenceLabel ?? "Evidence", pickValue(item, config.evidenceKeys ?? [])) +
    fieldBlock(config.whyLabel ?? "Why it happened", pickValue(item, config.whyKeys ?? [])) +
    fieldBlock(config.fixLabel ?? "What to fix", pickValue(item, config.fixKeys ?? [])) +
    fieldBlock(config.logicLabel ?? "Why this logic", pickValue(item, config.logicKeys ?? []), "logic", 160);

  return `<article class="insight-card ${config.tone ?? ""}">
    <h3>${clipped(title, 120)}</h3>
    <div class="insight-grid">${blocks || fallbackBlocks(item, skipKeys) || fieldBlock("Details", item)}</div>
  </article>`;
}

function insightCards(items: unknown[], config: InsightCardConfig) {
  if (!items.length) return `<p class="muted">No items available.</p>`;
  return `<div class="insight-cards">${items
    .slice(0, config.maxItems ?? 6)
    .map((item) => insightCard(item, config))
    .join("")}</div>${
    items.length > (config.maxItems ?? 6)
      ? `<p class="muted more-note">+${items.length - (config.maxItems ?? 6)} more in the source data</p>`
      : ""
  }`;
}

function compactBullets(value: unknown, maxItems = 5) {
  if (Array.isArray(value)) return list(value, "No summary available.", maxItems, 170);

  const clean = valueToText(value);
  if (!clean) return `<p class="muted">No summary available.</p>`;
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) ?? [clean];
  return list(sentences, "No summary available.", maxItems, 175);
}

function rankingCards(items: unknown[], titleKeys: string[]) {
  if (!items.length) return "";
  return `<div class="rank-grid">${items
    .slice(0, 8)
    .map((item, index) => {
      const record = asRecord(item);
      const title = isRecord(item) ? firstString(record, titleKeys, "Ranked item") : valueToText(item);
      const reason = isRecord(item)
        ? pickValue(record, ["reason", "verdict", "diagnosis", "evidence", "whyItWorks", "whyItFails"])
        : undefined;
      const rank = pickValue(record, ["rank"]) ?? index + 1;
      return `<article class="rank-card">
        <span>#${escapeHTML(rank)}</span>
        <strong>${clipped(title, 82)}</strong>
        ${hasContent(reason) ? `<p>${clipped(reason, 135, "")}</p>` : ""}
      </article>`;
    })
    .join("")}</div>`;
}

function healthScore(reportData: Record<string, unknown>) {
  const health = asRecord(reportData.overallHealthScore);
  const score = numberValue(health.score);
  const scale = score > 10 ? 100 : 10;
  const label = firstString(health, ["label"], "Health Score");
  return `<div class="score">
    <div class="score-ring">${score ? `${formatNumber(score, score % 1 ? 1 : 0)}/${scale}` : "-"}</div>
    <div>
      <h2>${text(label)}</h2>
      ${paragraph(health.reasoning, 240)}
    </div>
  </div>`;
}

function adsMetrics(payload: Record<string, unknown>) {
  const summary = asRecord(payload.summary);
  return [
    metricCard("Spend", formatCurrency(summary.totalSpend), "blue"),
    metricCard("Reach", formatNumber(summary.totalReach), "blue"),
    metricCard("Impressions", formatNumber(summary.totalImpressions), "blue"),
    metricCard("Clicks", formatNumber(summary.totalClicks), "blue"),
    metricCard("Leads", formatNumber(summary.totalLeads), "green"),
    metricCard("CTR", formatPercent(summary.overallCTR), "green"),
    metricCard("CPM", formatCurrency(summary.overallCPM), "amber"),
    metricCard("CPL", formatCurrency(summary.overallCPL), "red"),
  ].join("");
}

function socialMetrics(payload: Record<string, unknown>) {
  const summary = asRecord(payload.summary);
  return [
    metricCard("FB Posts", formatNumber(summary.fbPostCount), "blue"),
    metricCard("IG Posts", formatNumber(summary.igPostCount), "blue"),
    metricCard("FB Reach", formatNumber(summary.fbTotalReach), "blue"),
    metricCard("IG Reach", formatNumber(summary.igTotalReach), "blue"),
    metricCard("FB ER", formatPercent(summary.avgFbEngagementRate), "green"),
    metricCard("IG ER", formatPercent(summary.avgIgEngagementRate), "green"),
    metricCard("IG Reel Views", formatNumber(summary.igReelViews), "amber"),
    metricCard("Ad Spend", formatCurrency(numberValue(summary.fbTotalAdSpend) + numberValue(summary.igTotalAdSpend)), "red"),
  ].join("");
}

function adsTable(payload: Record<string, unknown>) {
  const ads = asArray(payload.ads);
  if (!ads.length) return `<p class="muted">No ad rows available.</p>`;

  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Ad</th><th>Campaign</th><th>Status</th><th>Spend</th><th>Reach</th><th>CTR</th><th>CPM</th><th>Leads</th><th>CPL</th>
    </tr></thead>
    <tbody>${ads
      .map((item) => {
        const ad = asRecord(item);
        return `<tr>
          <td>${text(ad.name, "")}</td>
          <td>${text(ad.campaign, "")}</td>
          <td>${text(ad.status, "")}</td>
          <td>${formatCurrency(ad.spend)}</td>
          <td>${formatNumber(ad.reach)}</td>
          <td>${formatPercent(ad.ctr)}</td>
          <td>${formatCurrency(ad.cpm)}</td>
          <td>${formatNumber(ad.leads)}</td>
          <td>${formatCurrency(ad.cpl)}</td>
        </tr>`;
      })
      .join("")}</tbody>
  </table></div>`;
}

function socialTable(payload: Record<string, unknown>) {
  const posts = asArray(payload.posts);
  if (!posts.length) return `<p class="muted">No post rows available.</p>`;

  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Platform</th><th>Post</th><th>Type</th><th>Reach</th><th>ER</th><th>Views</th><th>Spend</th><th>Action</th>
    </tr></thead>
    <tbody>${posts
      .slice(0, 120)
      .map((item) => {
        const post = asRecord(item);
        const caption = firstString(post, ["caption", "message"], "");
        return `<tr>
          <td>${text(post.platform, "")}</td>
          <td>${text(caption.slice(0, 120), "")}</td>
          <td>${text(post.type, "")}</td>
          <td>${formatNumber(post.totalReach ?? post.reach)}</td>
          <td>${formatPercent(post.engagementRate)}</td>
          <td>${formatNumber(post.views)}</td>
          <td>${formatCurrency(post.amountSpent)}</td>
          <td>${post.isBoosted ? "Boosted" : "Organic"}</td>
        </tr>`;
      })
      .join("")}</tbody>
  </table></div>`;
}

function deepDive(reportData: Record<string, unknown>, mode: ReportMode) {
  const creative = asRecord(mode === "ads" ? reportData.creativeDeepDive : reportData.contentDeepDive);
  return `<div class="two-col">
    ${insightCard(creative.topPerformer, {
      titleKeys: ["adName", "postCaption", "caption", "title"],
      evidenceKeys: ["keyMetrics", "evidence", "metrics"],
      whyKeys: ["whyItWorks", "whyItPerformed", "reason"],
      fixKeys: ["whatToReplicate", "recommendation", "nextStep"],
      logicKeys: ["scalingPotential", "verdict"],
      fallbackTitle: "Top Performer",
      fixLabel: "What to replicate",
      tone: "green",
    })}
    ${insightCard(creative.worstPerformer, {
      titleKeys: ["adName", "postCaption", "caption", "title"],
      evidenceKeys: ["keyMetrics", "evidence", "metrics"],
      whyKeys: ["whyItFails", "whyItDidNotWork", "reason", "rootCause"],
      fixKeys: ["whatToChange", "recommendation", "nextStep"],
      logicKeys: ["verdict", "priority"],
      fallbackTitle: "Worst Performer",
      fixLabel: "What to change",
      tone: "red",
    })}
  </div>
  ${rankingCards(asArray(creative.creativeRankings ?? creative.contentRankings), ["adName", "postCaption", "verdict"])}`;
}

function accountDiagnosis(value: unknown) {
  const record = asRecord(value);
  if (!Object.keys(record).length) return `<p class="muted">No diagnosis available.</p>`;

  const scoreSignals = Object.entries(record)
    .filter(([key, entry]) => /score/i.test(key) && hasContent(entry))
    .map(([key, entry]) => `${labelize(key)}: ${valueToText(entry)}`);

  return `<div class="insight-grid diagnosis-grid">
    ${fieldBlock("Biggest problem", record.biggestProblem, "red", 220)}
    ${fieldBlock(
      "Why it happened",
      pickValue(record, ["rootCause", "whereTheAccountIsLacking", "observations", "whatTheDataReveals"]),
      "",
      220
    )}
    ${fieldBlock("What to fix", record.biggestOpportunity, "green", 220)}
    ${fieldBlock("Logic signal", scoreSignals, "logic", 180)}
  </div>`;
}

function budgetOptimization(value: unknown) {
  const record = asRecord(value);
  if (!Object.keys(record).length) return `<p class="muted">No budget recommendations available.</p>`;

  return `<div class="insight-card amber">
    <h3>Budget Action Plan</h3>
    <div class="insight-grid">
      ${fieldBlock("Evidence", pickValue(record, ["currentAllocation", "wastedSpend"]), "", 190)}
      ${fieldBlock("Why it happened", record.summary, "", 190)}
      ${fieldBlock("What to fix", record.actions, "", 190)}
      ${fieldBlock("Why this logic", record.wastedSpend, "logic", 160)}
    </div>
  </div>`;
}

function reelHookAnalysis(value: unknown) {
  const record = asRecord(value);
  if (!Object.keys(record).length) return `<p class="muted">No reel hook analysis available.</p>`;

  return `<div class="insight-card">
    <h3>${clipped(pickValue(record, ["hookQualityRating", "headline"]) ?? "Reel Hook Diagnosis", 90)}</h3>
    <div class="insight-grid">
      ${fieldBlock("Evidence", [record.avgSkipRate, record.avgWatchTime, record.avgHoldRate, record.totalViews], "", 180)}
      ${fieldBlock("Why it happened", pickValue(record, ["bestHook", "worstHook"]), "", 190)}
      ${fieldBlock("What to fix", record.hookImprovementPlan, "", 190)}
      ${fieldBlock("Why this logic", record.hookQualityRating, "logic", 120)}
    </div>
  </div>`;
}

function platformAndBoosting(reportData: Record<string, unknown>) {
  const platform = asRecord(reportData.platformComparison);
  const boosting = asRecord(reportData.boostingAnalysis);
  return `<div class="two-col">
    ${insightCard(platform, {
      titleKeys: ["fbVsIg", "audienceBehavior"],
      evidenceKeys: ["fbVsIg", "audienceBehavior"],
      whyKeys: ["crossPostingOpportunity"],
      fixKeys: ["platformRecommendations", "recommendations"],
      logicKeys: ["verdict", "priority"],
      fallbackTitle: "Platform Diagnosis",
    })}
    ${insightCard(boosting, {
      titleKeys: ["overallAssessment", "boostingStrategy"],
      evidenceKeys: ["bestBoostedPost", "worstBoostedPost"],
      whyKeys: ["overallAssessment"],
      fixKeys: ["boostingStrategy", "recommendations"],
      logicKeys: ["verdict", "priority"],
      fallbackTitle: "Boosting Diagnosis",
    })}
  </div>`;
}

function actionPlan(reportData: Record<string, unknown>) {
  return [
    section(
      "Prioritized Actions",
      insightCards(asArray(reportData.prioritizedActions), {
        titleKeys: ["action", "title", "priority"],
        evidenceKeys: ["evidence", "basedOn", "currentMetric"],
        whyKeys: ["reason", "why", "rootCause", "problem"],
        fixKeys: ["execution", "steps", "tasks", "recommendation"],
        logicKeys: ["expectedResult", "expectedMetricMovement", "timeToImpact", "effort"],
        fallbackTitle: "Action",
        whyLabel: "Why now",
        fixLabel: "What to do",
        logicLabel: "Expected movement",
        maxItems: 6,
      })
    ),
    section(
      "30-Day Execution Plan",
      insightCards(asArray(reportData.thirtyDayPlan), {
        titleKeys: ["week", "focus", "title"],
        evidenceKeys: ["evidence", "baseline", "currentMetric"],
        whyKeys: ["reason", "why", "goal"],
        fixKeys: ["actions", "tasks", "execution", "plan"],
        logicKeys: ["successMetric", "expectedResult", "timeToImpact"],
        fallbackTitle: "Weekly Focus",
        whyLabel: "Why",
        fixLabel: "Plan",
        logicLabel: "Success metric",
        maxItems: 5,
      })
    ),
    section(
      "Quick Wins",
      insightCards(asArray(reportData.quickWins), {
        titleKeys: ["action", "title"],
        evidenceKeys: ["evidence", "basedOn", "currentMetric"],
        whyKeys: ["reason", "why"],
        fixKeys: ["execution", "steps", "recommendation"],
        logicKeys: ["expectedResult", "expectedMetricMovement", "timeToImpact"],
        fallbackTitle: "Quick Win",
        whyLabel: "Why",
        fixLabel: "Do this",
        logicLabel: "Expected movement",
        maxItems: 6,
      })
    ),
  ].join("");
}

export function renderReportHtml(options: ReportOptions) {
  const payload = asRecord(options.payload);
  const reportData = asRecord(options.reportData);
  const meta = asRecord(payload.meta);
  const client = firstString(meta, ["clientName", "client"], "Client");
  const from = firstString(meta, ["from"], "");
  const to = firstString(meta, ["to"], "");
  const isSocial = options.mode === "social";
  const title = isSocial ? "Social Media Performance Intelligence Report" : "Meta Ads Performance Intelligence Report";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHTML(title)} - ${escapeHTML(client)}</title>
  <style>
    :root { color-scheme: light; --ink:#0f172a; --muted:#64748b; --line:#d9e2ef; --blue:#1d4ed8; --green:#047857; --red:#b91c1c; --amber:#b45309; --bg:#f8fafc; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Arial, Helvetica, sans-serif; color:var(--ink); background:var(--bg); line-height:1.5; }
    header { padding:42px 46px; color:white; background:linear-gradient(135deg,#07111f,#123c73 55%,#155e75); }
    header .brand { font-size:13px; letter-spacing:.22em; font-weight:800; opacity:.8; }
    header h1 { margin:10px 0 12px; font-size:34px; line-height:1.05; max-width:980px; }
    header p { margin:0; opacity:.86; }
    main { max-width:1160px; margin:0 auto; padding:28px; }
    section { background:white; border:1px solid var(--line); border-radius:8px; padding:24px; margin:0 0 18px; break-inside:avoid; }
    h2 { margin:0 0 14px; font-size:21px; }
    h3 { margin:0 0 9px; font-size:15px; }
    p { margin:0 0 10px; }
    ul { margin:0; padding-left:20px; }
    li { margin:5px 0; }
    .muted { color:var(--muted); }
    .more-note { margin-top:8px; font-size:12px; }
    .score { display:grid; grid-template-columns:120px 1fr; gap:22px; align-items:center; }
    .score-ring { width:112px; height:112px; border-radius:999px; display:grid; place-items:center; background:#eff6ff; border:10px solid var(--blue); color:var(--blue); font-weight:900; font-size:21px; }
    .summary-box { margin-top:18px; border-top:1px solid var(--line); padding-top:16px; }
    .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    .metric { border:1px solid var(--line); border-left:5px solid var(--blue); border-radius:8px; padding:14px; background:#fbfdff; }
    .metric span { display:block; color:var(--muted); font-size:11px; text-transform:uppercase; font-weight:800; letter-spacing:.08em; }
    .metric strong { display:block; font-size:22px; margin-top:4px; }
    .metric.green { border-left-color:var(--green); } .metric.red { border-left-color:var(--red); } .metric.amber { border-left-color:var(--amber); }
    .two-col { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .card, .callout { border:1px solid var(--line); border-radius:8px; padding:16px; background:#fff; }
    .callout { border-left:6px solid var(--blue); }
    .callout.green { border-left-color:var(--green); background:#f0fdf4; }
    .callout.red { border-left-color:var(--red); background:#fef2f2; }
    .insight-cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .insight-card { border:1px solid var(--line); border-left:5px solid var(--blue); border-radius:8px; padding:16px; background:#fff; break-inside:avoid; }
    .insight-card.green { border-left-color:var(--green); background:#f4fbf7; }
    .insight-card.red { border-left-color:var(--red); background:#fff7f7; }
    .insight-card.amber { border-left-color:var(--amber); background:#fffbeb; }
    .insight-grid, .diagnosis-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .insight-block { border:1px solid #edf2f7; border-radius:8px; padding:10px; background:#fbfdff; }
    .insight-block span { display:block; color:#475569; font-size:10px; text-transform:uppercase; font-weight:900; letter-spacing:.08em; margin-bottom:4px; }
    .insight-block p { margin:0; font-size:13px; }
    .insight-block.logic { background:#f8fafc; }
    .rank-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-top:14px; }
    .rank-card { border:1px solid var(--line); border-radius:8px; padding:11px; background:#fff; }
    .rank-card span { display:block; color:var(--blue); font-size:11px; font-weight:900; margin-bottom:4px; }
    .rank-card strong { display:block; font-size:13px; line-height:1.25; }
    .rank-card p { margin:6px 0 0; color:var(--muted); font-size:12px; }
    .table-wrap { overflow:auto; border:1px solid var(--line); border-radius:8px; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th { background:#eef4ff; text-align:left; font-size:11px; text-transform:uppercase; color:#334155; }
    th, td { padding:9px 10px; border-bottom:1px solid #e8eef7; vertical-align:top; }
    tr:nth-child(even) td { background:#fbfdff; }
    .print-btn { position:fixed; right:22px; bottom:22px; border:0; border-radius:999px; background:#1d4ed8; color:white; padding:12px 18px; font-weight:800; box-shadow:0 14px 30px rgba(15,23,42,.22); cursor:pointer; }
    @media print {
      body { background:white; font-size:11px; }
      .print-btn { display:none; }
      header { padding:28px; }
      main { padding:18px; max-width:none; }
      section { border-color:#ccc; page-break-inside:avoid; }
      .cards, .two-col, .metrics, .insight-cards, .insight-grid, .diagnosis-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .rank-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      table { font-size:10px; }
    }
    @media (max-width: 760px) {
      main { padding:16px; }
      header { padding:30px 22px; }
      header h1 { font-size:28px; }
      .score, .metrics, .two-col, .cards, .insight-cards, .insight-grid, .diagnosis-grid, .rank-grid { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">BLUDASH</div>
    <h1>${escapeHTML(title)}</h1>
    <p>${escapeHTML(client)} | ${escapeHTML(from)} to ${escapeHTML(to)} | Model: ${escapeHTML(options.model)} | Generated ${new Date().toLocaleDateString("en-IN")}</p>
  </header>
  <main>
    ${section("Executive Summary", `${healthScore(reportData)}<div class="summary-box"><h3>Key Points</h3>${compactBullets(reportData.executiveSummary, 5)}</div>`)}
    ${section("Top Metrics", `<div class="metrics">${isSocial ? socialMetrics(payload) : adsMetrics(payload)}</div>`)}
    ${section("Key Takeaways", list(asArray(reportData.keyTakeaways), "No takeaways available.", 6, 175))}
    ${section("Account Diagnosis", accountDiagnosis(reportData.accountDiagnosis))}
    ${section("Deep Dive", deepDive(reportData, options.mode))}
    ${section(
      "What Is Working",
      insightCards(asArray(reportData.whatIsWorking), {
        titleKeys: ["point", "pattern", "title"],
        evidenceKeys: ["evidence", "keyMetrics", "data"],
        whyKeys: ["whyItWorks", "whyItWorked", "reason"],
        fixKeys: ["recommendation", "whatToReplicate", "nextStep"],
        logicKeys: ["scalingPotential", "expectedResult", "verdict"],
        fixLabel: "How to scale",
        logicLabel: "Why this logic",
        fallbackTitle: "Winning signal",
        tone: "green",
        maxItems: 5,
      })
    )}
    ${section(
      "What Is Not Working",
      insightCards(asArray(reportData.whatIsNotWorking), {
        titleKeys: ["point", "problem", "title"],
        evidenceKeys: ["evidence", "keyMetrics", "data"],
        whyKeys: ["whyItFails", "whyItDidNotWork", "rootCause", "reason"],
        fixKeys: ["recommendation", "whatToChange", "nextStep"],
        logicKeys: ["verdict", "priority", "expectedResult"],
        fallbackTitle: "Problem signal",
        tone: "red",
        maxItems: 6,
      })
    )}
    ${isSocial ? section("Reel Hook Analysis", reelHookAnalysis(reportData.reelHookAnalysis)) : section("Budget Optimization", budgetOptimization(reportData.budgetOptimization))}
    ${isSocial
      ? section("Platform And Boosting", platformAndBoosting(reportData))
      : section(
          "Campaign Analysis",
          insightCards(asArray(reportData.campaignAnalysis), {
            titleKeys: ["campaignName", "name", "title"],
            evidenceKeys: ["evidence", "keyMetrics", "metrics"],
            whyKeys: ["diagnosis", "reason", "rootCause"],
            fixKeys: ["action", "recommendation", "nextStep"],
            logicKeys: ["verdict", "priority", "expectedResult"],
            fallbackTitle: "Campaign",
            maxItems: 6,
          })
        )}
    ${actionPlan(reportData)}
    ${section("Data Appendix", isSocial ? socialTable(payload) : adsTable(payload), "appendix")}
  </main>
  <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
</body>
</html>`;
}
