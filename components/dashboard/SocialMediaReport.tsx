"use client";

import { useState, useEffect } from "react";
import { useBoostedPosts, BoostedPost } from "./useBoostedPosts";
import PostModal from "./PostModal";

interface Post {
  id: string;
  message: string;
  createdTime: string;
  permalink: string;
  thumbnail: string | null;
  mediaUrl: string | null;
  type: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: string;
  avgWatchTime?: number | null;
}

interface ReportData {
  fbPosts: Post[];
  igPosts: Post[];
}

interface Props {
  client: string;
  from: string;
  to: string;
  platform: string;
  dark: boolean;
  onBack: () => void;
}

const STEPS = [
  "Connecting to Meta API...",
  "Fetching Facebook posts...",
  "Fetching Instagram posts...",
  "Pulling post insights...",
  "Calculating engagement rates...",
  "Building your report...",
];

const BASE = "https://graph.facebook.com/v25.0";

type SortKey = "default" | "likes" | "comments" | "shares" | "saves" | "reach" | "engagement";

function igVal(data: any[], name: string): number {
  const metric = data?.find((m: any) => m.name === name);
  if (!metric) return 0;
  if (typeof metric.value === "number") return metric.value;
  if (Array.isArray(metric.values) && metric.values.length > 0) {
    return metric.values[0]?.value ?? 0;
  }
  return 0;
}

function matchBoosted(post: Post, boostedMap: Record<string, BoostedPost>): BoostedPost | null {
  const key = post.message.trim().substring(0, 100).toLowerCase();
  return (
    boostedMap[key] ||
    Object.values(boostedMap).find(
      (b) =>
        b.body.trim().substring(0, 100).toLowerCase() === key ||
        post.message.trim().startsWith(b.body.trim().substring(0, 80)) ||
        b.body.trim().startsWith(post.message.trim().substring(0, 80))
    ) ||
    null
  );
}

// ─── Export: CSV ──────────────────────────────────────────────────────────────
function exportCSV(params: {
  client: string;
  from: string;
  to: string;
  fbPosts: Post[];
  igPosts: Post[];
  boostedMap: Record<string, BoostedPost>;
  fbFollows: { follows: number; unfollows: number };
  igFollows: { follows: number; unfollows: number };
  fbPageViews: number;
  igProfileViews: number;
}) {
  const { client, from, to, fbPosts, igPosts, boostedMap, fbFollows, igFollows, fbPageViews, igProfileViews } = params;
  const rows: string[] = [];

  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const row = (cols: (string | number)[]) => rows.push(cols.map(esc).join(","));

  // ── Header ────────────────────────────────────────────────────────────────
  row([`Bludash Social Media Report`]);
  row([`Client: ${client}`, `Period: ${from} to ${to}`]);
  rows.push("");

  // ── FB Summary ────────────────────────────────────────────────────────────
  row(["FACEBOOK SUMMARY"]);
  const fbOrganicLikes    = fbPosts.reduce((s, p) => s + p.likes, 0);
  const fbOrganicComments = fbPosts.reduce((s, p) => s + p.comments, 0);
  const fbOrganicShares   = fbPosts.reduce((s, p) => s + p.shares, 0);
  const fbOrganicReach    = fbPosts.reduce((s, p) => s + p.reach, 0);
  const fbPaidReach       = fbPosts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.reach || 0), 0);
  row(["Metric", "Organic", "Paid", "Total"]);
  row(["Likes",    fbOrganicLikes,    0,           fbOrganicLikes]);
  row(["Comments", fbOrganicComments, 0,           fbOrganicComments]);
  row(["Shares",   fbOrganicShares,   0,           fbOrganicShares]);
  row(["Reach",    fbOrganicReach,    fbPaidReach, fbOrganicReach + fbPaidReach]);
  rows.push("");
  row(["Audience", "Follows", "Unfollows", "Net", "Page Views"]);
  row(["Facebook", fbFollows.follows, fbFollows.unfollows, fbFollows.follows - fbFollows.unfollows, fbPageViews]);
  rows.push("");

  // ── IG Summary ────────────────────────────────────────────────────────────
  row(["INSTAGRAM SUMMARY"]);
  const igOrganicLikes    = igPosts.reduce((s, p) => s + p.likes, 0);
  const igOrganicComments = igPosts.reduce((s, p) => s + p.comments, 0);
  const igOrganicShares   = igPosts.reduce((s, p) => s + p.shares, 0);
  const igOrganicReach    = igPosts.reduce((s, p) => s + p.reach, 0);
  const igPaidLikes       = igPosts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidLikes    || 0), 0);
  const igPaidComments    = igPosts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidComments || 0), 0);
  const igPaidShares      = igPosts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidShares   || 0), 0);
  const igPaidReach       = igPosts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.reach        || 0), 0);
  row(["Metric", "Organic", "Paid", "Total"]);
  row(["Likes",    igOrganicLikes,    igPaidLikes,    igOrganicLikes    + igPaidLikes]);
  row(["Comments", igOrganicComments, igPaidComments, igOrganicComments + igPaidComments]);
  row(["Shares",   igOrganicShares,   igPaidShares,   igOrganicShares   + igPaidShares]);
  row(["Reach",    igOrganicReach,    igPaidReach,    igOrganicReach    + igPaidReach]);
  rows.push("");
  row(["Audience", "Follows", "Unfollows", "Net", "Profile Views"]);
  row(["Instagram", igFollows.follows, igFollows.unfollows, igFollows.follows - igFollows.unfollows, igProfileViews]);
  rows.push("");

  // ── FB Posts Table ─────────────────────────────────────────────────────────
  row(["FACEBOOK POSTS"]);
  if (fbPosts.length === 0) {
    row(["No Facebook posts in this period."]);
  } else {
    row(["Date", "Type", "Caption", "Likes", "Comments", "Shares", "Reach", "Eng. Rate (%)", "Boosted", "Amount Spent", "Paid Reach", "Impressions", "Link Clicks", "CPM", "CTR (%)", "Ad Name", "Post Link"]);
    for (const p of fbPosts) {
      const b = matchBoosted(p, boostedMap);
      row([
        new Date(p.createdTime).toLocaleDateString("en-IN"),
        p.type,
        p.message,
        p.likes,
        p.comments,
        p.shares,
        p.reach + (b?.reach || 0),
        p.engagementRate,
        b ? "Yes" : "No",
        b ? parseFloat(b.amountSpent).toLocaleString() : "",
        b ? b.reach : "",
        b ? b.impressions : "",
        b ? b.clicks : "",
        b ? b.cpm : "",
        b ? b.ctr : "",
        b ? b.adName : "",
        p.permalink,
      ]);
    }
  }
  rows.push("");

  // ── IG Posts Table ─────────────────────────────────────────────────────────
  row(["INSTAGRAM POSTS"]);
  if (igPosts.length === 0) {
    row(["No Instagram posts in this period."]);
  } else {
    row(["Date", "Type", "Caption", "Likes", "Comments", "Shares", "Saves", "Reach", "Eng. Rate (%)", "Avg Watch (s)", "Boosted", "Amount Spent", "Paid Reach", "Impressions", "Link Clicks", "Paid Likes", "Paid Comments", "Paid Shares", "CPM", "CTR (%)", "Ad Name", "Post Link"]);
    for (const p of igPosts) {
      const b = matchBoosted(p, boostedMap);
      row([
        new Date(p.createdTime).toLocaleDateString("en-IN"),
        p.type,
        p.message,
        p.likes    + (b?.paidLikes    || 0),
        p.comments + (b?.paidComments || 0),
        p.shares   + (b?.paidShares   || 0),
        p.saves,
        p.reach    + (b?.reach        || 0),
        p.engagementRate,
        p.type === "REEL" && p.avgWatchTime != null ? p.avgWatchTime : "",
        b ? "Yes" : "No",
        b ? parseFloat(b.amountSpent).toLocaleString() : "",
        b ? b.reach : "",
        b ? b.impressions : "",
        b ? b.clicks : "",
        b ? b.paidLikes : "",
        b ? b.paidComments : "",
        b ? b.paidShares : "",
        b ? b.cpm : "",
        b ? b.ctr : "",
        b ? b.adName : "",
        p.permalink,
      ]);
    }
  }

  const csvContent = rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `bludash_report_${client}_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Export: PDF (client-side via jsPDF + jspdf-autotable) ───────────────────
async function exportPDF(params: {
  client: string;
  from: string;
  to: string;
  fbPosts: Post[];
  igPosts: Post[];
  boostedMap: Record<string, BoostedPost>;
  fbFollows: { follows: number; unfollows: number };
  igFollows: { follows: number; unfollows: number };
  fbPageViews: number;
  igProfileViews: number;
}) {
  const { client, from, to, fbPosts, igPosts, boostedMap, fbFollows, igFollows, fbPageViews, igProfileViews } = params;

  // Dynamically import jsPDF + autoTable (must be installed: npm i jspdf jspdf-autotable)
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 14;

  // ── Colour palette ────────────────────────────────────────────────────────
  const BLUE   = [29,  78, 216] as [number, number, number];
  const PURPLE = [124, 58, 237] as [number, number, number];
  const DARK   = [10,  10,  20] as [number, number, number];
  const MUTED  = [120, 120, 140] as [number, number, number];
  const LIGHT  = [245, 246, 250] as [number, number, number];
  const WHITE  = [255, 255, 255] as [number, number, number];
  const GREEN  = [16, 185, 129] as [number, number, number];
  const RED    = [239,  68,  68] as [number, number, number];
  const AMBER  = [217, 119,   6] as [number, number, number];
  const AMBER_LIGHT = [254, 243, 199] as [number, number, number];

  // ── Helper: section header ─────────────────────────────────────────────────
  const sectionHeader = (title: string, color: [number, number, number] = BLUE) => {
    if (y > 175) { doc.addPage(); y = 14; }
    doc.setFillColor(...color);
    doc.roundedRect(10, y, pageW - 20, 8, 2, 2, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(title, 15, y + 5.5);
    y += 12;
    doc.setTextColor(...DARK);
  };

  // ── Helper: summary cards row ──────────────────────────────────────────────
  const summaryCards = (cards: { label: string; value: string; sub?: string; color?: [number, number, number] }[]) => {
    const cardW = (pageW - 20 - (cards.length - 1) * 3) / cards.length;
    cards.forEach((card, i) => {
      const cx = 10 + i * (cardW + 3);
      doc.setFillColor(...LIGHT);
      doc.roundedRect(cx, y, cardW, 18, 2, 2, "F");
      doc.setTextColor(...MUTED);
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text(card.label.toUpperCase(), cx + 3, y + 5);
      doc.setTextColor(...(card.color || DARK));
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(card.value, cx + 3, y + 12);
      if (card.sub) {
        doc.setTextColor(...MUTED);
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.text(card.sub, cx + 3, y + 17);
      }
    });
    y += 22;
  };

  // ── Helper: audience bar ───────────────────────────────────────────────────
  const audienceBar = (follows: number, unfollows: number, views: number, viewsLabel: string) => {
    const net = follows - unfollows;
    doc.setFillColor(...LIGHT);
    doc.roundedRect(10, y, pageW - 20, 12, 2, 2, "F");
    const items = [
      { label: "Follows",   value: follows.toLocaleString(),   color: DARK  },
      { label: "Unfollows", value: unfollows.toLocaleString(), color: DARK  },
      { label: "Net",       value: (net >= 0 ? "+" : "") + net.toLocaleString(), color: net >= 0 ? GREEN : RED },
      { label: viewsLabel,  value: views > 0 ? views.toLocaleString() : "—",    color: DARK },
    ];
    const slotW = (pageW - 20) / items.length;
    items.forEach((item, i) => {
      const cx = 10 + i * slotW;
      doc.setTextColor(...MUTED);
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text(item.label.toUpperCase(), cx + 4, y + 5);
      doc.setTextColor(...item.color);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(item.value, cx + 4, y + 10.5);
    });
    y += 16;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // COVER / TITLE
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setFillColor(...BLUE);
  doc.circle(pageW - 20, -10, 30, "F");

  doc.setTextColor(...WHITE);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Bludash", 14, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 220);
  doc.text("Social Media Analytics Report", 14, 21);

  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.text(`Client: ${client}`, pageW - 14, 14, { align: "right" });
  doc.text(`Period: ${from}  →  ${to}`, pageW - 14, 21, { align: "right" });
  y = 38;

  // ═══════════════════════════════════════════════════════════════════════════
  // FACEBOOK SECTION
  // ═══════════════════════════════════════════════════════════════════════════
  sectionHeader("  FACEBOOK", BLUE);

  // Summary cards
  const fbOrganicLikes    = fbPosts.reduce((s, p) => s + p.likes, 0);
  const fbOrganicComments = fbPosts.reduce((s, p) => s + p.comments, 0);
  const fbOrganicShares   = fbPosts.reduce((s, p) => s + p.shares, 0);
  const fbOrganicReach    = fbPosts.reduce((s, p) => s + p.reach, 0);
  const fbPaidReach       = fbPosts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.reach || 0), 0);

  summaryCards([
    { label: "Likes",    value: fbOrganicLikes.toLocaleString(),                           sub: `Organic: ${fbOrganicLikes.toLocaleString()}` },
    { label: "Comments", value: fbOrganicComments.toLocaleString(),                        sub: `Organic: ${fbOrganicComments.toLocaleString()}` },
    { label: "Shares",   value: fbOrganicShares.toLocaleString(),                          sub: `Organic: ${fbOrganicShares.toLocaleString()}` },
    { label: "Reach",    value: (fbOrganicReach + fbPaidReach).toLocaleString(),           sub: `Organic: ${fbOrganicReach.toLocaleString()}  |  Paid: ${fbPaidReach.toLocaleString()}` },
    { label: "Posts",    value: fbPosts.length.toString() },
  ]);

  // Audience
  audienceBar(fbFollows.follows, fbFollows.unfollows, fbPageViews, "Page Views");

  // FB Posts Table
  if (y > 160) { doc.addPage(); y = 14; }
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MUTED);
  doc.text("Facebook Posts", 10, y);
  y += 4;

  const fbTableBody = fbPosts.length === 0
    ? [["No Facebook posts in this period.", "", "", "", "", "", "", "", "", ""]]
    : fbPosts.map(p => {
        const b = matchBoosted(p, boostedMap);
        return [
          new Date(p.createdTime).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          p.type,
          p.message.length > 55 ? p.message.substring(0, 55) + "…" : (p.message || "—"),
          p.likes.toLocaleString(),
          p.comments.toLocaleString(),
          p.shares.toLocaleString(),
          (p.reach + (b?.reach || 0)).toLocaleString(),
          `${p.engagementRate}%`,
          b ? `Yes\n₹${parseFloat(b.amountSpent).toLocaleString()}` : "—",
          p.permalink,
        ];
      });

  autoTable(doc, {
    startY: y,
    head: [["Date", "Type", "Caption", "Likes", "Comments", "Shares", "Reach", "Eng.%", "Boosted", "Post Link"]],
    body: fbTableBody,
    theme: "grid",
    styles: { fontSize: 6.5, cellPadding: 2, overflow: "linebreak", halign: "left", textColor: DARK },
    headStyles: { fillColor: BLUE, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 249, 252] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 16 },
      2: { cellWidth: 60 },
      3: { cellWidth: 14, halign: "right" },
      4: { cellWidth: 16, halign: "right" },
      5: { cellWidth: 14, halign: "right" },
      6: { cellWidth: 18, halign: "right" },
      7: { cellWidth: 14, halign: "right" },
      8: { cellWidth: 20 },
      9: { cellWidth: 50, textColor: [29, 78, 216] as [number, number, number] },
    },
    didDrawCell: (data) => {
      // Render post link as clickable annotation
      if (data.section === "body" && data.column.index === 9 && fbPosts.length > 0) {
        const rowIdx = data.row.index;
        if (rowIdx < fbPosts.length) {
          const link = fbPosts[rowIdx].permalink;
          if (link) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: link });
          }
        }
      }
      // Colour boosted cell
      if (data.section === "body" && data.column.index === 8 && fbPosts.length > 0) {
        const rowIdx = data.row.index;
        if (rowIdx < fbPosts.length && matchBoosted(fbPosts[rowIdx], boostedMap)) {
          doc.setFillColor(...AMBER_LIGHT);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, "F");
          doc.setTextColor(...AMBER);
          doc.setFontSize(6.5);
          doc.text(String(data.cell.raw), data.cell.x + 2, data.cell.y + 4);
        }
      }
    },
    margin: { left: 10, right: 10 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTAGRAM SECTION
  // ═══════════════════════════════════════════════════════════════════════════
  if (y > 155) { doc.addPage(); y = 14; }
  sectionHeader("  INSTAGRAM", PURPLE);

  const igOrganicLikes    = igPosts.reduce((s, p) => s + p.likes, 0);
  const igOrganicComments = igPosts.reduce((s, p) => s + p.comments, 0);
  const igOrganicShares   = igPosts.reduce((s, p) => s + p.shares, 0);
  const igOrganicSaves    = igPosts.reduce((s, p) => s + p.saves, 0);
  const igOrganicReach    = igPosts.reduce((s, p) => s + p.reach, 0);
  const igPaidLikes       = igPosts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidLikes    || 0), 0);
  const igPaidComments    = igPosts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidComments || 0), 0);
  const igPaidShares      = igPosts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidShares   || 0), 0);
  const igPaidReach       = igPosts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.reach        || 0), 0);

  summaryCards([
    { label: "Likes",    value: (igOrganicLikes    + igPaidLikes).toLocaleString(),    sub: `Organic: ${igOrganicLikes.toLocaleString()}  |  Paid: ${igPaidLikes.toLocaleString()}`,    color: PURPLE },
    { label: "Comments", value: (igOrganicComments + igPaidComments).toLocaleString(), sub: `Organic: ${igOrganicComments.toLocaleString()}  |  Paid: ${igPaidComments.toLocaleString()}`, color: PURPLE },
    { label: "Shares",   value: (igOrganicShares   + igPaidShares).toLocaleString(),   sub: `Organic: ${igOrganicShares.toLocaleString()}  |  Paid: ${igPaidShares.toLocaleString()}`,   color: PURPLE },
    { label: "Saves",    value: igOrganicSaves.toLocaleString(),                                                                                                                          color: PURPLE },
    { label: "Reach",    value: (igOrganicReach    + igPaidReach).toLocaleString(),    sub: `Organic: ${igOrganicReach.toLocaleString()}  |  Paid: ${igPaidReach.toLocaleString()}`,     color: PURPLE },
    { label: "Posts",    value: igPosts.length.toString() },
  ]);

  audienceBar(igFollows.follows, igFollows.unfollows, igProfileViews, "Profile Views");

  if (y > 155) { doc.addPage(); y = 14; }
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MUTED);
  doc.text("Instagram Posts", 10, y);
  y += 4;

  const igTableBody = igPosts.length === 0
    ? [["No Instagram posts in this period.", "", "", "", "", "", "", "", "", "", ""]]
    : igPosts.map(p => {
        const b = matchBoosted(p, boostedMap);
        const totalLikes    = p.likes    + (b?.paidLikes    || 0);
        const totalComments = p.comments + (b?.paidComments || 0);
        const totalShares   = p.shares   + (b?.paidShares   || 0);
        const totalReach    = p.reach    + (b?.reach        || 0);
        return [
          new Date(p.createdTime).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          p.type,
          p.message.length > 50 ? p.message.substring(0, 50) + "…" : (p.message || "—"),
          totalLikes.toLocaleString(),
          totalComments.toLocaleString(),
          totalShares.toLocaleString(),
          p.saves.toLocaleString(),
          totalReach.toLocaleString(),
          `${p.engagementRate}%`,
          p.type === "REEL" && p.avgWatchTime != null ? `${p.avgWatchTime}s` : "—",
          b ? `Yes\n₹${parseFloat(b.amountSpent).toLocaleString()}` : "—",
          p.permalink,
        ];
      });

  autoTable(doc, {
    startY: y,
    head: [["Date", "Type", "Caption", "Likes", "Comments", "Shares", "Saves", "Reach", "Eng.%", "Avg Watch", "Boosted", "Post Link"]],
    body: igTableBody,
    theme: "grid",
    styles: { fontSize: 6.5, cellPadding: 2, overflow: "linebreak", halign: "left", textColor: DARK },
    headStyles: { fillColor: PURPLE, textColor: WHITE, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 249, 252] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 16 },
      2: { cellWidth: 54 },
      3: { cellWidth: 12, halign: "right" },
      4: { cellWidth: 16, halign: "right" },
      5: { cellWidth: 12, halign: "right" },
      6: { cellWidth: 12, halign: "right" },
      7: { cellWidth: 18, halign: "right" },
      8: { cellWidth: 12, halign: "right" },
      9: { cellWidth: 16, halign: "right" },
      10: { cellWidth: 20 },
      11: { cellWidth: 46, textColor: [124, 58, 237] as [number, number, number] },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 11 && igPosts.length > 0) {
        const rowIdx = data.row.index;
        if (rowIdx < igPosts.length) {
          const link = igPosts[rowIdx].permalink;
          if (link) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: link });
          }
        }
      }
      if (data.section === "body" && data.column.index === 10 && igPosts.length > 0) {
        const rowIdx = data.row.index;
        if (rowIdx < igPosts.length && matchBoosted(igPosts[rowIdx], boostedMap)) {
          doc.setFillColor(...AMBER_LIGHT);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, "F");
          doc.setTextColor(...AMBER);
          doc.setFontSize(6.5);
          doc.text(String(data.cell.raw), data.cell.x + 2, data.cell.y + 4);
        }
      }
    },
    margin: { left: 10, right: 10 },
  });

  // ── Footer on each page ────────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...DARK);
    doc.rect(0, doc.internal.pageSize.getHeight() - 8, pageW, 8, "F");
    doc.setTextColor(120, 120, 140);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text(`Bludash  ·  ${client}  ·  ${from} – ${to}`, 12, doc.internal.pageSize.getHeight() - 2.5);
    doc.text(`Page ${i} of ${totalPages}`, pageW - 12, doc.internal.pageSize.getHeight() - 2.5, { align: "right" });
  }

  doc.save(`bludash_report_${client}_${from}_${to}.pdf`);
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, organic, paid, dark, accent }: {
  label: string; value: string; organic?: string; paid?: string | null; dark: boolean; accent?: "green" | "red";
}) {
  const hasBreakdown = organic !== undefined;
  const hasPaid = paid && paid !== "0";
  return (
    <div className={`rounded-xl overflow-hidden ${dark ? "border border-white/[0.08] bg-[#1a1a2e]" : "border border-black/20 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]"}`}>
      <div className="px-4 pt-4 pb-3">
        <p className={`text-[10px] font-semibold tracking-[0.12em] uppercase mb-2 ${dark ? "text-white/40" : "text-slate-400"}`}>{label}</p>
        <p className={`text-[28px] font-bold leading-none tracking-tight ${accent === "green" ? "text-emerald-500" : accent === "red" ? "text-red-500" : dark ? "text-white" : "text-slate-900"}`}>{value}</p>
      </div>
      {hasBreakdown && (
        <div className={`px-4 py-2.5 border-t flex flex-col gap-1.5 ${dark ? "bg-white/[0.03] border-white/[0.06]" : "bg-slate-50 border-black/10"}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dark ? "bg-white/30" : "bg-slate-400"}`} />
              <span className={`text-[10px] font-medium ${dark ? "text-white/35" : "text-slate-500"}`}>Organic</span>
            </div>
            <span className={`text-[11px] font-semibold tabular-nums ${dark ? "text-white/60" : "text-slate-700"}`}>{organic}</span>
          </div>
          {hasPaid && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400" />
                <span className="text-[10px] font-medium text-amber-600">Paid</span>
              </div>
              <span className="text-[11px] font-semibold tabular-nums text-amber-600">{paid}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary Section ──────────────────────────────────────────────────────────
function SummarySection({ title, icon, posts, dark, boostedMap, follows, isFB, profileViews }: {
  title: string; icon: React.ReactNode; posts: Post[]; dark: boolean;
  boostedMap: Record<string, BoostedPost>; follows: { follows: number; unfollows: number };
  isFB: boolean; profileViews: number;
}) {
  const organicLikes    = posts.reduce((s, p) => s + p.likes, 0);
  const organicComments = posts.reduce((s, p) => s + p.comments, 0);
  const organicShares   = posts.reduce((s, p) => s + p.shares, 0);
  const organicReach    = posts.reduce((s, p) => s + p.reach, 0);
  const paidLikes       = isFB ? 0 : posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidLikes    || 0), 0);
  const paidComments    = isFB ? 0 : posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidComments || 0), 0);
  const paidShares      = isFB ? 0 : posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.paidShares   || 0), 0);
  const paidReach       = posts.reduce((s, p) => s + (matchBoosted(p, boostedMap)?.reach || 0), 0);
  const net = follows.follows - follows.unfollows;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5 px-1">
        {icon}
        <h3 className={`text-[12px] font-bold tracking-[0.14em] uppercase ${dark ? "text-white/50" : "text-black/40"}`}>{title}</h3>
        <div className={`flex-1 h-px ${dark ? "bg-white/[0.06]" : "bg-black/[0.06]"}`} />
        <span className={`text-[11px] font-medium ${dark ? "text-white/25" : "text-black/25"}`}>{posts.length} post{posts.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard label="Likes"    value={(organicLikes    + paidLikes).toLocaleString()}    organic={organicLikes.toLocaleString()}    paid={paidLikes    > 0 ? paidLikes.toLocaleString()    : null} dark={dark} />
        <MetricCard label="Comments" value={(organicComments + paidComments).toLocaleString()} organic={organicComments.toLocaleString()} paid={paidComments > 0 ? paidComments.toLocaleString() : null} dark={dark} />
        <MetricCard label="Shares"   value={(organicShares   + paidShares).toLocaleString()}   organic={organicShares.toLocaleString()}   paid={paidShares   > 0 ? paidShares.toLocaleString()   : null} dark={dark} />
        <MetricCard label="Reach"    value={(organicReach    + paidReach).toLocaleString()}     organic={organicReach.toLocaleString()}    paid={paidReach    > 0 ? paidReach.toLocaleString()    : null} dark={dark} />
      </div>
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-4 flex-wrap ${dark ? "border-white/[0.08] bg-[#1a1a2e]" : "border-black/20 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]"}`}>
        <span className={`text-[10px] font-semibold tracking-[0.12em] uppercase mr-auto ${dark ? "text-white/30" : "text-slate-400"}`}>Audience</span>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-[11px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Follows
          </div>
          <span className={`text-[15px] font-bold tabular-nums ${dark ? "text-white" : "text-slate-900"}`}>{follows.follows.toLocaleString()}</span>
        </div>
        <div className={`w-px h-5 ${dark ? "bg-white/[0.08]" : "bg-black/10"}`} />
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-[11px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Unfollows
          </div>
          <span className={`text-[15px] font-bold tabular-nums ${dark ? "text-white/70" : "text-slate-700"}`}>{follows.unfollows.toLocaleString()}</span>
        </div>
        <div className={`w-px h-5 ${dark ? "bg-white/[0.08]" : "bg-black/10"}`} />
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>Net</span>
          <span className={`text-[15px] font-bold tabular-nums ${net >= 0 ? "text-emerald-500" : "text-red-500"}`}>{net >= 0 ? "+" : ""}{net.toLocaleString()}</span>
        </div>
        <div className={`w-px h-5 ${dark ? "bg-white/[0.08]" : "bg-black/10"}`} />
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-[11px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {isFB ? "Page Views" : "Profile Views"}
          </div>
          <span className={`text-[15px] font-bold tabular-nums ${dark ? "text-white" : "text-slate-900"}`}>{profileViews > 0 ? profileViews.toLocaleString() : "—"}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Post Table ───────────────────────────────────────────────────────────────
function PostTable({ posts, showSaves, dark, boostedMap, onRowClick, isFB }: {
  posts: Post[]; showSaves: boolean; dark: boolean; boostedMap: Record<string, BoostedPost>;
  onRowClick: (post: Post, boosted: BoostedPost | null) => void; isFB: boolean;
}) {
  if (posts.length === 0)
    return <p className={`text-sm text-center py-10 ${dark ? "text-white/25" : "text-slate-400"}`}>No posts found.</p>;

  const headers = ["Preview", "Type", "Boosted", "Date", "Caption", "Likes", "Comments", "Shares", ...(showSaves ? ["Saves"] : []), "Reach", "Eng. Rate", ...(showSaves ? ["Avg Watch"] : [])];
  const rightAlign = new Set(["Likes", "Comments", "Shares", "Saves", "Reach", "Eng. Rate", "Avg Watch"]);

  return (
    <div className={`rounded-xl border overflow-hidden ${dark ? "border-white/[0.08]" : "border-black/20"}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={dark ? "bg-[#1a1a2e] border-b border-white/[0.08]" : "bg-slate-100 border-b border-black/10"}>
              {headers.map((h) => (
                <th key={h} className={`px-4 py-3.5 text-[10px] font-bold tracking-widest uppercase ${rightAlign.has(h) ? "text-right" : "text-left"} ${dark ? "text-white/40" : "text-slate-500"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.map((post, idx) => {
              const boosted = matchBoosted(post, boostedMap);
              const totalLikes    = post.likes    + (isFB ? 0 : (boosted?.paidLikes    || 0));
              const totalComments = post.comments + (isFB ? 0 : (boosted?.paidComments || 0));
              const totalShares   = post.shares   + (isFB ? 0 : (boosted?.paidShares   || 0));
              const totalReach    = post.reach    + (boosted?.reach || 0);
              const isEven        = idx % 2 === 0;
              return (
                <tr key={post.id} onClick={() => { onRowClick(post, boosted); }}
                  className={`border-t transition-colors cursor-pointer ${dark ? `border-white/[0.05] ${isEven ? "bg-white/[0.01]" : "bg-transparent"} hover:bg-white/[0.04]` : `border-black/[0.06] ${isEven ? "bg-white" : "bg-slate-50/60"} hover:bg-blue-50/50`}`}>
                  <td className="px-4 py-3">
                    {post.thumbnail ? (
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                        <img src={post.thumbnail} alt="" className="w-full h-full object-cover" />
                        {post.type === "REEL" && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${dark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={dark ? "text-white/25" : "text-slate-400"}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full tracking-widest uppercase ${post.type === "REEL" ? dark ? "bg-purple-500/20 text-purple-300" : "bg-purple-100 text-purple-700" : post.type === "CAROUSEL" ? dark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700" : dark ? "bg-white/[0.08] text-white/40" : "bg-slate-200 text-slate-600"}`}>{post.type}</span>
                  </td>
                  <td className="px-4 py-3">
                    {!boosted ? <span className={`text-[11px] ${dark ? "text-white/20" : "text-slate-300"}`}>—</span> : (
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${dark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-700"}`}>BOOSTED</span>
                        <span className={`text-[10px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>₹{parseFloat(boosted.amountSpent).toLocaleString()}</span>
                        <span className={`text-[10px] font-medium ${boosted.status === "ACTIVE" ? dark ? "text-emerald-400" : "text-emerald-600" : boosted.status === "PAUSED" ? dark ? "text-yellow-400" : "text-yellow-600" : dark ? "text-white/25" : "text-slate-400"}`}>{boosted.status}</span>
                      </div>
                    )}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-[11px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>
                    {new Date(post.createdTime).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className={`px-4 py-3 max-w-[180px] text-[12px] ${dark ? "text-white/60" : "text-slate-700"}`}><p className="truncate">{post.message || "—"}</p></td>
                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>{totalLikes.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>{totalComments.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>{totalShares.toLocaleString()}</td>
                  {showSaves && <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>{post.saves.toLocaleString()}</td>}
                  <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>{totalReach.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${parseFloat(post.engagementRate) >= 3 ? dark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700" : parseFloat(post.engagementRate) >= 1 ? dark ? "bg-yellow-500/20 text-yellow-300" : "bg-yellow-100 text-yellow-700" : dark ? "bg-red-500/20 text-red-300" : "bg-red-100 text-red-700"}`}>{post.engagementRate}%</span>
                  </td>
                  {showSaves && <td className={`px-4 py-3 text-right text-[13px] font-semibold ${dark ? "text-purple-300" : "text-purple-600"}`}>{post.type === "REEL" && post.avgWatchTime != null ? `${post.avgWatchTime}s` : "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SocialMediaReport({ client, from, to, platform, dark, onBack }: Props) {
  const [loading, setLoading]     = useState(true);
  const [step, setStep]           = useState(0);
  const [progress, setProgress]   = useState(0);
  const [data, setData]           = useState<ReportData | null>(null);
  const [error, setError]         = useState("");
  const [activeTab, setActiveTab] = useState<"FB" | "IG">(platform === "IG" ? "IG" : "FB");
  const [search, setSearch]       = useState("");
  const [sortKey, setSortKey]     = useState<SortKey>("default");
  const { boostedMap }            = useBoostedPosts(client, from, to);
  const [selectedPost, setSelectedPost]       = useState<Post | null>(null);
  const [selectedBoosted, setSelectedBoosted] = useState<BoostedPost | null>(null);
  const [cfgToken, setCfgToken]   = useState("");
  const [fbFollows, setFbFollows]           = useState({ follows: 0, unfollows: 0 });
  const [igFollows, setIgFollows]           = useState({ follows: 0, unfollows: 0 });
  const [fbPageViews, setFbPageViews]       = useState(0);
  const [igProfileViews, setIgProfileViews] = useState(0);
  const [exportingPDF, setExportingPDF]     = useState(false);
  const [exportingCSV, setExportingCSV]     = useState(false);
  const [creatingManusReport, setCreatingManusReport] = useState(false);


  useEffect(() => { fetchReport(); }, []);

  const fetchReport = async () => {
    setLoading(true); setData(null); setError(""); setStep(0); setProgress(0);
    let cfg: { token: string; fbPageId: string; igUserId: string };
    try {
      const cfgRes = await fetch(`/api/social-media?client=${client}`);
      cfg = await cfgRes.json();
      setCfgToken(cfg.token);
      if (!cfg.token) { setError("Invalid client config"); setLoading(false); return; }

      fetch(`${BASE}/${cfg.fbPageId}/insights?metric=page_daily_follows_unique,page_daily_unfollows_unique&period=day&since=${from}&until=${to}&access_token=${cfg.token}`)
        .then(r => r.json()).then(d => {
          const fw = d?.data?.find((m: any) => m.name === "page_daily_follows_unique");
          const uf = d?.data?.find((m: any) => m.name === "page_daily_unfollows_unique");
          setFbFollows({ follows: fw?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0, unfollows: uf?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0 });
        }).catch(() => {});

      fetch(`${BASE}/${cfg.fbPageId}/insights?metric=page_views_total&period=day&since=${from}&until=${to}&access_token=${cfg.token}`)
        .then(r => r.json()).then(d => {
          const metric = d?.data?.find((m: any) => m.name === "page_views_total");
          setFbPageViews(metric?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0);
        }).catch(() => {});

      fetch(`${BASE}/${cfg.igUserId}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=${from}&until=${to}&access_token=${cfg.token}`)
        .then(r => r.json()).then(d => {
          const breakdown = d?.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
          setIgFollows({ follows: breakdown.find((b: any) => b.dimension_values?.[0] === "FOLLOWER")?.value || 0, unfollows: breakdown.find((b: any) => b.dimension_values?.[0] === "NON_FOLLOWER")?.value || 0 });
        }).catch(() => {});

      fetch(`${BASE}/${cfg.igUserId}/insights?metric=profile_views&metric_type=total_value&period=day&since=${from}&until=${to}&access_token=${cfg.token}`)
        .then(r => r.json()).then(d => { setIgProfileViews(d?.data?.[0]?.total_value?.value || 0); }).catch(() => {});
    } catch {
      setError("Failed to load client config"); setLoading(false); return;
    }

    try {
      let fbPosts: Post[] = [];
      let igPosts: Post[] = [];
      setStep(0); setProgress(10);
      await new Promise(r => setTimeout(r, 400));

      if (platform === "FB" || platform === "BOTH") {
        setStep(1); setProgress(20);
        const fbRes  = await fetch(`${BASE}/${cfg.fbPageId}/posts?fields=id,message,created_time,permalink_url,full_picture,reactions.summary(total_count),comments.summary(total_count),shares,attachments{media_type,media{source}}&since=${from}&until=${to}&limit=100&access_token=${cfg.token}`);
        const fbData = await fbRes.json();
        const rawFB  = fbData.data || [];
        setStep(3); setProgress(45);
        fbPosts = await Promise.all(rawFB.map(async (post: any) => {
          const isReel   = post.permalink_url?.includes("/reel/") || post.permalink_url?.includes("/videos/");
          const mediaUrl = post.attachments?.data?.[0]?.media?.source || null;
          const likes    = post.reactions?.summary?.total_count ?? 0;
          const comments = post.comments?.summary?.total_count  ?? 0;
          const shares   = post.shares?.count ?? 0;
          try {
            const insRes = await fetch(`${BASE}/${post.id}/insights?metric=post_impressions_unique&access_token=${cfg.token}`);
            const ins    = await insRes.json();
            const reach  = ins?.data?.find((m: any) => m.name === "post_impressions_unique")?.values?.[0]?.value ?? 0;
            return { id: post.id, message: post.message || "", createdTime: post.created_time, permalink: post.permalink_url, thumbnail: post.full_picture || null, mediaUrl, type: isReel ? "REEL" : "IMAGE", reach, likes, comments, shares, saves: 0, engagementRate: reach > 0 ? (((likes + comments + shares) / reach) * 100).toFixed(2) : "0.00" };
          } catch {
            return { id: post.id, message: post.message || "", createdTime: post.created_time, permalink: post.permalink_url, thumbnail: post.full_picture || null, mediaUrl, type: isReel ? "REEL" : "IMAGE", reach: 0, likes, comments, shares, saves: 0, engagementRate: "0.00" };
          }
        }));
      }

      if (platform === "IG" || platform === "BOTH") {
        setStep(2); setProgress(65);
        const igRes  = await fetch(`${BASE}/${cfg.igUserId}/media?fields=id,caption,media_type,timestamp,permalink,media_url,thumbnail_url&since=${from}&until=${to}&limit=100&access_token=${cfg.token}`);
        const igData = await igRes.json();
        const rawIG  = igData.data || [];
        setStep(4); setProgress(80);
        igPosts = await Promise.all(rawIG.map(async (post: any) => {
          try {
            const insRes = await fetch(`${BASE}/${post.id}/insights?metric=reach,likes,comments,shares,saved&period=lifetime&access_token=${cfg.token}`);
            const ins    = await insRes.json();
            const reach    = igVal(ins?.data, "reach");
            const likes    = igVal(ins?.data, "likes");
            const comments = igVal(ins?.data, "comments");
            const shares   = igVal(ins?.data, "shares");
            const saves    = igVal(ins?.data, "saved");
            const mediaType = post.media_type === "VIDEO" ? "REEL" : post.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : "IMAGE";
            const mediaUrl: string | null  = (mediaType === "REEL" || mediaType === "IMAGE") ? (post.media_url || null) : null;
            const thumbnail: string | null = post.thumbnail_url || (mediaType !== "REEL" ? post.media_url : null) || null;
            let avgWatchTime = null;
            if (mediaType === "REEL") {
              try {
                const wRes  = await fetch(`${BASE}/${post.id}/insights?metric=ig_reels_avg_watch_time&period=lifetime&access_token=${cfg.token}`);
                const wData = await wRes.json();
                const val = igVal(wData?.data, "ig_reels_avg_watch_time");
                if (val) avgWatchTime = Math.round(val / 1000);
              } catch {}
            }
            return { id: post.id, message: post.caption || "", createdTime: post.timestamp, permalink: post.permalink, thumbnail, mediaUrl, type: mediaType, reach, likes, comments, shares, saves, engagementRate: reach > 0 ? (((likes + comments + shares + saves) / reach) * 100).toFixed(2) : "0.00", avgWatchTime };
          } catch {
            return { id: post.id, message: post.caption || "", createdTime: post.timestamp, permalink: post.permalink, thumbnail: null, mediaUrl: null, type: "IMAGE", reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, engagementRate: "0.00" };
          }
        }));
      }

      setStep(5); setProgress(100);
      await new Promise(r => setTimeout(r, 300));
      setData({ fbPosts, igPosts });
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const getTotal = (post: Post, key: "likes" | "comments" | "shares" | "reach") => {
    const b    = matchBoosted(post, boostedMap);
    const isFB = activeTab === "FB";
    if (key === "likes")    return post.likes    + (isFB ? 0 : (b?.paidLikes    || 0));
    if (key === "comments") return post.comments + (isFB ? 0 : (b?.paidComments || 0));
    if (key === "shares")   return post.shares   + (isFB ? 0 : (b?.paidShares   || 0));
    if (key === "reach")    return post.reach    + (b?.reach || 0);
    return 0;
  };

  const getFilteredSorted = (posts: Post[]) => {
    let result = posts.filter(p => p.message.toLowerCase().includes(search.toLowerCase()));
    if      (sortKey === "likes")      result = [...result].sort((a, b) => getTotal(b, "likes")    - getTotal(a, "likes"));
    else if (sortKey === "comments")   result = [...result].sort((a, b) => getTotal(b, "comments") - getTotal(a, "comments"));
    else if (sortKey === "shares")     result = [...result].sort((a, b) => getTotal(b, "shares")   - getTotal(a, "shares"));
    else if (sortKey === "saves")      result = [...result].sort((a, b) => b.saves - a.saves);
    else if (sortKey === "reach")      result = [...result].sort((a, b) => getTotal(b, "reach")    - getTotal(a, "reach"));
    else if (sortKey === "engagement") result = [...result].sort((a, b) => parseFloat(b.engagementRate) - parseFloat(a.engagementRate));
    return result;
  };

  const handleExportPDF = async () => {
    if (!data) return;
    setExportingPDF(true);
    try {
      await exportPDF({ client, from, to, fbPosts: data.fbPosts, igPosts: data.igPosts, boostedMap, fbFollows, igFollows, fbPageViews, igProfileViews });
    } finally {
      setExportingPDF(false);
    }
  };

  const handleExportCSV = () => {
    if (!data) return;
    setExportingCSV(true);
    try {
      exportCSV({ client, from, to, fbPosts: data.fbPosts, igPosts: data.igPosts, boostedMap, fbFollows, igFollows, fbPageViews, igProfileViews });
    } finally {
      setExportingCSV(false);
    }
  };

  const handleManusReportPDF = async () => {
  if (!data) return;

  setCreatingManusReport(true);
  try {
    const payload = {
      type: "Social Media Report",
      client,
      from,
      to,
      data: {
        platform,
        fbPosts: data.fbPosts,
        igPosts: data.igPosts,
        fbFollows,
        igFollows,
        fbPageViews,
        igProfileViews,
      },
    };

    const res = await fetch("/api/manus-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result?.error || "Failed to create Manus report");

    window.open(result.taskUrl, "_blank", "noopener,noreferrer");
  } catch (e: any) {
    alert(e.message || "Failed to create Manus report");
  } finally {
    setCreatingManusReport(false);
  }
};


  const fromLabel = new Date(from).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const toLabel   = new Date(to).toLocaleDateString("en-IN",   { day: "2-digit", month: "short", year: "numeric" });

  const sortTabs: { key: SortKey; label: string }[] = [
    { key: "default",    label: "Latest" },
    { key: "likes",      label: "Top Likes" },
    { key: "comments",   label: "Top Comments" },
    { key: "shares",     label: "Top Shares" },
    { key: "saves",      label: "Top Saves" },
    { key: "reach",      label: "Top Reach" },
    { key: "engagement", label: "Top Engagement" },
  ];

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className={`w-full max-w-sm rounded-full h-1.5 ${dark ? "bg-white/[0.06]" : "bg-black/[0.06]"}`}>
        <div className="h-1.5 rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (<div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i < step ? "bg-blue-500" : i === step ? "bg-blue-400 scale-125" : dark ? "bg-white/10" : "bg-black/10"}`} />))}
        </div>
        <p className={`text-[13px] font-medium ${dark ? "text-white/60" : "text-black/50"}`}>{STEPS[step]}</p>
        <p className={`text-[11px] ${dark ? "text-white/25" : "text-black/25"}`}>{progress}% complete</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center gap-4 py-16">
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        <p className="text-[13px] text-red-400">{error}</p>
      </div>
      <button onClick={onBack} className={`text-[12px] px-4 py-2 rounded-lg border transition-all ${dark ? "border-white/10 text-white/40 hover:text-white/80" : "border-black/10 text-black/40 hover:text-black/70"}`}>← Back</button>
    </div>
  );

  if (!data) return null;

  const activePosts = getFilteredSorted(activeTab === "FB" ? data.fbPosts : data.igPosts);
  const showSaves   = activeTab === "IG";

  return (
    <div className="w-full max-w-[1200px] mx-auto flex flex-col gap-6 pb-16">

      {/* ── Header row with Back + Export buttons ───────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onBack}
          className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition-all ${dark ? "border-white/10 text-white/40 hover:text-white/80 hover:border-white/20" : "border-black/10 text-black/40 hover:text-black/70"}`}
        >
          ← Back
        </button>

        <div className="flex items-center gap-2">
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-black/10"}`} />
          <span className={`text-[11px] tracking-widest uppercase font-medium ${dark ? "text-white/25" : "text-black/25"}`}>
            Social Media Report · {fromLabel} — {toLabel}
          </span>
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-black/10"}`} />
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          {/* CSV */}
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
              dark
                ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                : "border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-600/50"
            }`}
          >
            {exportingCSV ? (
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
            )}
            Export CSV
          </button>

          {/* PDF */}
          <button
            onClick={handleExportPDF}
            disabled={exportingPDF}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
              dark
                ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/50"
                : "border-blue-600/30 text-blue-700 hover:bg-blue-50 hover:border-blue-600/50"
            }`}
          >
            {exportingPDF ? (
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <path d="M9 13h6M9 17h6M9 9h1"/>
              </svg>
            )}
            Export PDF
          </button>
          <button
  onClick={handleManusReportPDF}
  disabled={creatingManusReport}
  className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
    dark
      ? "border-fuchsia-500/30 text-fuchsia-400 hover:bg-fuchsia-500/10 hover:border-fuchsia-500/50"
      : "border-fuchsia-600/30 text-fuchsia-700 hover:bg-fuchsia-50 hover:border-fuchsia-600/50"
  }`}
>
  {creatingManusReport ? (
    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8L12 3z" />
    </svg>
  )}
  ManusAI Report PDF
</button>

        </div>
      </div>

      {/* FB Summary */}
      {(platform === "FB" || platform === "BOTH") && (
        <SummarySection title="Facebook" isFB={true} profileViews={fbPageViews}
          icon={<div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg></div>}
          posts={data.fbPosts} dark={dark} boostedMap={boostedMap} follows={fbFollows}
        />
      )}

      {/* IG Summary */}
      {(platform === "IG" || platform === "BOTH") && (
        <SummarySection title="Instagram" isFB={false} profileViews={igProfileViews}
          icon={<div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none" /></svg></div>}
          posts={data.igPosts} dark={dark} boostedMap={boostedMap} follows={igFollows}
        />
      )}

      <div className={`h-px w-full ${dark ? "bg-white/[0.05]" : "bg-black/[0.05]"}`} />

      {/* Search + Sort */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${dark ? "text-white/25" : "text-black/25"}`}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by caption..."
            className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm transition-all focus:outline-none ${dark ? "bg-white/[0.03] border border-white/[0.07] text-white placeholder:text-white/20 focus:border-blue-500/40" : "bg-white/80 border border-slate-200 text-[#0a0a14] placeholder:text-black/20 focus:border-blue-500/40"}`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {sortTabs.map(tab => tab.key === "saves" && platform === "FB" ? null : (
            <button key={tab.key} onClick={() => setSortKey(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all duration-200 ${sortKey === tab.key ? "bg-blue-600 text-white shadow-[0_2px_10px_rgba(59,130,246,0.3)]" : dark ? "bg-white/[0.04] text-white/35 hover:text-white/60 border border-white/[0.06]" : "bg-black/[0.04] text-black/35 hover:text-black/60 border border-black/[0.06]"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Platform toggle */}
      {platform === "BOTH" && (
        <div className={`flex rounded-xl p-1 gap-1 w-fit ${dark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-black/[0.03] border border-black/[0.06]"}`}>
          <button onClick={() => setActiveTab("FB")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200 ${activeTab === "FB" ? "bg-blue-600 text-white shadow-[0_2px_12px_rgba(59,130,246,0.3)]" : dark ? "text-white/40 hover:text-white/70" : "text-black/40 hover:text-black/70"}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>
            Facebook ({data.fbPosts.length})
          </button>
          <button onClick={() => setActiveTab("IG")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200 ${activeTab === "IG" ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_2px_12px_rgba(168,85,247,0.3)]" : dark ? "text-white/40 hover:text-white/70" : "text-black/40 hover:text-black/70"}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
            Instagram ({data.igPosts.length})
          </button>
        </div>
      )}

      {/* Table */}
      <PostTable posts={activePosts} showSaves={showSaves} dark={dark} boostedMap={boostedMap} isFB={activeTab === "FB"}
        onRowClick={(post, boosted) => { setSelectedPost(post); setSelectedBoosted(boosted); }}
      />

      {/* Modal */}
      {selectedPost && (
        <PostModal post={selectedPost} boosted={selectedBoosted}
          onClose={() => { setSelectedPost(null); setSelectedBoosted(null); }}
          dark={dark} showSaves={showSaves} platform={activeTab} token={cfgToken}
        />
      )}
    </div>
  );
}