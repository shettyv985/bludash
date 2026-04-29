"use client";

import { useState, type ReactNode } from "react";
import AdModal from "./AdModal";
import {
  useAdsPerformance,
  type Ad,
  type Campaign,
} from "./useAdsPerformance";
import { useManusReport } from "./useManusReport";
import ManusReportToast from "./ManusReportToast";
type SortKey =
  | "spend"
  | "reach"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpm"
  | "cpc"
  | "likes"
  | "comments"
  | "shares"
  | "videoViews";

type SortDir = "asc" | "desc";
type ViewMode = "grouped" | "flat";

interface Props {
  client: string;
  from: string;
  to: string;
  dark: boolean;
  onBack: () => void;
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals > 0 ? decimals : 0,
    maximumFractionDigits: decimals,
  });
}

function fmtMoney(n: number) {
  return "₹" + fmt(n, 2);
}

function fmtPct(n: number) {
  return `${n.toFixed(2)}%`;
}

function getCTRHighlight(ctr: number): "good" | "warn" | "bad" {
  return ctr >= 1.5 ? "good" : ctr >= 0.8 ? "warn" : "bad";
}

function getCPCHighlight(cpc: number): "good" | "warn" | "bad" {
  return cpc < 5 ? "good" : cpc < 15 ? "warn" : "bad";
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
  icon,
  dark,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon: ReactNode;
  dark: boolean;
}) {
  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        dark
          ? "bg-[#1a1a2e] border-white/[0.08]"
          : "bg-white border-black/[0.1] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
      }`}
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <p
            className={`text-[10px] font-semibold tracking-[0.14em] uppercase ${
              dark ? "text-white/35" : "text-slate-400"
            }`}
          >
            {label}
          </p>
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              dark ? "bg-white/[0.05]" : "bg-slate-100"
            }`}
          >
            {icon}
          </div>
        </div>
        <p
          className={`text-[26px] font-bold leading-none tracking-tight ${
            accent || (dark ? "text-white" : "text-slate-900")
          }`}
        >
          {value}
        </p>
        {sub && (
          <p className={`text-[10px] mt-1 ${dark ? "text-white/25" : "text-slate-400"}`}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, dark }: { status: string; dark: boolean }) {
  const s = status?.toUpperCase();

  const color =
    s === "ACTIVE"
      ? dark
        ? "bg-emerald-500/15 text-emerald-400"
        : "bg-emerald-100 text-emerald-700"
      : s === "PAUSED"
        ? dark
          ? "bg-yellow-500/15 text-yellow-400"
          : "bg-yellow-100 text-yellow-700"
        : s === "ARCHIVED"
          ? dark
            ? "bg-slate-500/15 text-slate-400"
            : "bg-slate-100 text-slate-600"
          : dark
            ? "bg-white/[0.06] text-white/30"
            : "bg-slate-100 text-slate-500";

  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full tracking-widest uppercase ${color}`}>
      {s || "—"}
    </span>
  );
}

function MetricCell({
  value,
  highlight,
  dark,
}: {
  value: string;
  highlight?: "good" | "bad" | "warn" | null;
  dark: boolean;
}) {
  const color =
    highlight === "good"
      ? dark
        ? "text-emerald-400"
        : "text-emerald-700"
      : highlight === "bad"
        ? dark
          ? "text-red-400"
          : "text-red-700"
        : highlight === "warn"
          ? dark
            ? "text-yellow-400"
            : "text-yellow-700"
          : dark
            ? "text-white/80"
            : "text-slate-800";

  return <span className={`text-[12px] font-semibold tabular-nums ${color}`}>{value}</span>;
}

function AdRow({
  ad,
  dark,
  isEven,
  showCampaignCols,
  onClick,
}: {
  ad: Ad;
  dark: boolean;
  isEven: boolean;
  showCampaignCols: boolean;
  onClick?: () => void;
}) {
  const ins = ad.insights;

  return (
    <tr
      onClick={onClick}
      className={`border-t transition-colors ${onClick ? "cursor-pointer" : ""} ${
        dark
          ? `border-white/[0.04] ${isEven ? "bg-white/[0.01]" : "bg-transparent"} hover:bg-white/[0.04]`
          : `border-black/[0.05] ${isEven ? "bg-white" : "bg-slate-50/60"} hover:bg-blue-50/40`
      }`}
    >
      <td className="px-3 py-2">
        {ad.thumbnail ? (
          <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
            <img src={ad.thumbnail} alt="" className="w-full h-full object-cover" />
            {ad.isVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
            )}
          </div>
        ) : (
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              dark ? "bg-white/[0.04]" : "bg-slate-100"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={dark ? "text-white/20" : "text-slate-300"}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}
      </td>

      <td className="px-3 py-3 min-w-[140px] max-w-[180px]">
        <p className={`text-[12px] font-medium leading-tight truncate ${dark ? "text-white/80" : "text-slate-800"}`}>
          {ad.name}
        </p>
        <StatusBadge status={ad.status} dark={dark} />
      </td>

      {showCampaignCols && (
        <>
          <td
            className={`px-3 py-3 min-w-[120px] max-w-[160px] text-[11px] truncate ${
              dark ? "text-white/40" : "text-slate-500"
            }`}
          >
            {ad.campaignName}
          </td>
          <td
            className={`px-3 py-3 min-w-[120px] max-w-[160px] text-[11px] truncate ${
              dark ? "text-white/40" : "text-slate-500"
            }`}
          >
            {ad.adSetName}
          </td>
        </>
      )}

      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={fmtMoney(ins.spend)} dark={dark} />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={fmt(ins.reach)} dark={dark} />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={fmt(ins.impressions)} dark={dark} />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={fmt(ins.clicks)} dark={dark} />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={fmtPct(ins.ctr)} highlight={getCTRHighlight(ins.ctr)} dark={dark} />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={fmtMoney(ins.cpm)} dark={dark} />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell
          value={ins.cpc > 0 ? fmtMoney(ins.cpc) : "—"}
          highlight={ins.cpc > 0 ? getCPCHighlight(ins.cpc) : null}
          dark={dark}
        />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={fmt(ins.likes)} dark={dark} />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={fmt(ins.comments)} dark={dark} />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={fmt(ins.shares)} dark={dark} />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={fmt(ins.videoViews)} dark={dark} />
      </td>
    </tr>
  );
}

function GroupedView({
  campaigns,
  dark,
  onAdClick,
}: {
  campaigns: Campaign[];
  dark: boolean;
  onAdClick: (ad: Ad) => void;
}) {
  const [openCampaigns, setOpenCampaigns] = useState<Record<string, boolean>>({});
  const [openAdSets, setOpenAdSets] = useState<Record<string, boolean>>({});

  const toggleCampaign = (id: string) => setOpenCampaigns((p) => ({ ...p, [id]: !p[id] }));
  const toggleAdSet = (id: string) => setOpenAdSets((p) => ({ ...p, [id]: !p[id] }));

  const colHeaders = [
    "",
    "Ad",
    "Spend",
    "Reach",
    "Impressions",
    "Clicks",
    "CTR",
    "CPM",
    "CPC",
    "Likes",
    "Comments",
    "Shares",
    "Video Views",
  ];

  const rightAlign = new Set([
    "Spend",
    "Reach",
    "Impressions",
    "Clicks",
    "CTR",
    "CPM",
    "CPC",
    "Likes",
    "Comments",
    "Shares",
    "Video Views",
  ]);

  return (
    <div className="flex flex-col gap-3">
      {campaigns.map((camp) => {
        const campOpen = openCampaigns[camp.id] !== false;
        const campAds = camp.adSets.flatMap((s) => s.ads);
        const campSpend = campAds.reduce((s, a) => s + a.insights.spend, 0);
        const campReach = campAds.reduce((s, a) => s + a.insights.reach, 0);

        return (
          <div
            key={camp.id}
            className={`rounded-xl border overflow-hidden ${
              dark
                ? "border-white/[0.08] bg-[#0f0f1a]"
                : "border-black/[0.1] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
            }`}
          >
            <button
              onClick={() => toggleCampaign(camp.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                dark ? "bg-[#1a1a2e] hover:bg-[#1e1e35]" : "bg-slate-50 hover:bg-slate-100"
              }`}
            >
              <div
                className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-transform ${
                  campOpen ? "rotate-90" : ""
                } ${dark ? "bg-white/[0.06]" : "bg-slate-200"}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className={dark ? "text-white/50" : "text-slate-500"}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>

              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <span className={`text-[13px] font-semibold truncate ${dark ? "text-white/90" : "text-slate-800"}`}>
                  {camp.name}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    dark ? "bg-blue-500/15 text-blue-400" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {camp.objective}
                </span>
                <StatusBadge status={camp.status} dark={dark} />
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <p className={`text-[10px] ${dark ? "text-white/25" : "text-slate-400"}`}>Spend</p>
                  <p className={`text-[12px] font-bold ${dark ? "text-white/70" : "text-slate-700"}`}>
                    {fmtMoney(campSpend)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-[10px] ${dark ? "text-white/25" : "text-slate-400"}`}>Reach</p>
                  <p className={`text-[12px] font-bold ${dark ? "text-white/70" : "text-slate-700"}`}>
                    {fmt(campReach)}
                  </p>
                </div>
                <span className={`text-[11px] ${dark ? "text-white/25" : "text-slate-400"}`}>
                  {campAds.length} ad{campAds.length !== 1 ? "s" : ""}
                </span>
              </div>
            </button>

            {campOpen && (
              <div className="flex flex-col gap-2 p-3">
                {camp.adSets.map((adSet) => {
                  const setOpen = openAdSets[adSet.id] !== false;
                  const setAds = adSet.ads;
                  const setSpend = setAds.reduce((s, a) => s + a.insights.spend, 0);

                  return (
                    <div
                      key={adSet.id}
                      className={`rounded-lg border overflow-hidden ${
                        dark ? "border-white/[0.06] bg-[#0a0a14]" : "border-black/[0.06] bg-slate-50/80"
                      }`}
                    >
                      <button
                        onClick={() => toggleAdSet(adSet.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                          dark ? "hover:bg-white/[0.02]" : "hover:bg-slate-100/60"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-transform ${
                            setOpen ? "rotate-90" : ""
                          } ${dark ? "bg-white/[0.04]" : "bg-slate-200"}`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            className={dark ? "text-white/40" : "text-slate-500"}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>

                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                        <span className={`text-[12px] font-medium flex-1 truncate ${dark ? "text-white/70" : "text-slate-700"}`}>
                          {adSet.name}
                        </span>
                        <StatusBadge status={adSet.status} dark={dark} />
                        {adSet.dailyBudget ? (
                          <span className={`text-[10px] ${dark ? "text-white/30" : "text-slate-400"}`}>
                            Daily: {fmtMoney(adSet.dailyBudget)}
                          </span>
                        ) : null}
                        {adSet.lifetimeBudget ? (
                          <span className={`text-[10px] ${dark ? "text-white/30" : "text-slate-400"}`}>
                            Lifetime: {fmtMoney(adSet.lifetimeBudget)}
                          </span>
                        ) : null}
                        <span className={`text-[11px] font-semibold ml-2 ${dark ? "text-white/50" : "text-slate-600"}`}>
                          {fmtMoney(setSpend)}
                        </span>
                        <span className={`text-[10px] ${dark ? "text-white/20" : "text-slate-400"}`}>
                          {setAds.length} ad{setAds.length !== 1 ? "s" : ""}
                        </span>
                      </button>

                      {setOpen && setAds.length > 0 && (
                        <div className={`border-t overflow-x-auto ${dark ? "border-white/[0.05]" : "border-black/[0.05]"}`}>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className={dark ? "bg-[#1a1a2e]" : "bg-slate-100"}>
                                {colHeaders.map((h) => (
                                  <th
                                    key={h}
                                    className={`px-4 py-2.5 text-[9px] font-bold tracking-widest uppercase ${
                                      rightAlign.has(h) ? "text-right" : "text-left"
                                    } ${dark ? "text-white/30" : "text-slate-400"}`}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {setAds.map((ad, idx) => (
                                <AdRow
                                  key={ad.id}
                                  ad={ad}
                                  dark={dark}
                                  isEven={idx % 2 === 0}
                                  showCampaignCols={false}
                                  onClick={() => onAdClick(ad)}
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FlatTable({
  ads,
  sortKey,
  sortDir,
  onSort,
  dark,
  onRowClick,
}: {
  ads: Ad[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  dark: boolean;
  onRowClick: (ad: Ad) => void;
}) {
  const headers: { label: string; key?: SortKey; right?: boolean }[] = [
    { label: "" },
    { label: "Ad" },
    { label: "Campaign" },
    { label: "Ad Set" },
    { label: "Spend", key: "spend", right: true },
    { label: "Reach", key: "reach", right: true },
    { label: "Impressions", key: "impressions", right: true },
    { label: "Clicks", key: "clicks", right: true },
    { label: "CTR", key: "ctr", right: true },
    { label: "CPM", key: "cpm", right: true },
    { label: "CPC", key: "cpc", right: true },
    { label: "Likes", key: "likes", right: true },
    { label: "Comments", key: "comments", right: true },
    { label: "Shares", key: "shares", right: true },
    { label: "Video Views", key: "videoViews", right: true },
  ];

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        dark
          ? "border-white/[0.08] bg-[#0f0f1a]"
          : "border-black/[0.1] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
      }`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={dark ? "bg-[#1a1a2e]" : "bg-slate-100"}>
              {headers.map((h) => {
                const active = h.key === sortKey;
                return (
                  <th
                    key={h.label}
                    className={`px-4 py-2.5 text-[9px] font-bold tracking-widest uppercase ${
                      h.right ? "text-right" : "text-left"
                    } ${dark ? "text-white/30" : "text-slate-400"}`}
                  >
                    {h.key ? (
                      <button
                        onClick={() => onSort(h.key!)}
                        className={`inline-flex items-center gap-1 ${h.right ? "ml-auto" : ""}`}
                      >
                        {h.label}
                        <span className={`${active ? "opacity-100" : "opacity-30"}`}>
                          {active ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
                        </span>
                      </button>
                    ) : (
                      h.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ads.map((ad, idx) => (
              <AdRow
                key={ad.id}
                ad={ad}
                dark={dark}
                isEven={idx % 2 === 0}
                showCampaignCols={true}
                onClick={() => onRowClick(ad)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function exportCSV(ads: Ad[], client: string, from: string, to: string) {
  const headers = [
    "Ad Name",
    "Status",
    "Campaign",
    "Ad Set",
    "Spend",
    "Reach",
    "Impressions",
    "Clicks",
    "CTR",
    "CPM",
    "CPC",
    "Likes",
    "Comments",
    "Shares",
    "Video Views",
  ];

  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

  const rows = ads.map((ad) => [
    ad.name,
    ad.status,
    ad.campaignName,
    ad.adSetName,
    ad.insights.spend.toFixed(2),
    ad.insights.reach,
    ad.insights.impressions,
    ad.insights.clicks,
    ad.insights.ctr.toFixed(2),
    ad.insights.cpm.toFixed(2),
    ad.insights.cpc.toFixed(2),
    ad.insights.likes,
    ad.insights.comments,
    ad.insights.shares,
    ad.insights.videoViews,
  ]);

  const content = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bludash_performance_${client}_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPDF(
  ads: Ad[],
  campaigns: Campaign[],
  summary: {
    totalSpend: number;
    totalReach: number;
    totalImpressions: number;
    totalClicks: number;
    overallCTR: number;
    overallCPM: number;
    overallCPC: number;
    activeAds: number;
  },
  client: string,
  from: string,
  to: string
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(10, 10, 20);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setFillColor(29, 78, 216);
  doc.circle(pageW - 20, -10, 30, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Bludash", 14, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Performance Analytics Report", 14, 21);

  doc.setFontSize(8);
  doc.text(`Client: ${client}`, pageW - 14, 14, { align: "right" });
  doc.text(`Period: ${from} → ${to}`, pageW - 14, 21, { align: "right" });

  const cards = [
    { label: "TOTAL SPEND", value: fmtMoney(summary.totalSpend) },
    { label: "TOTAL REACH", value: fmt(summary.totalReach) },
    { label: "TOTAL IMPRESSIONS", value: fmt(summary.totalImpressions) },
    { label: "TOTAL CLICKS", value: fmt(summary.totalClicks) },
    { label: "CTR", value: fmtPct(summary.overallCTR) },
    { label: "CPM", value: fmtMoney(summary.overallCPM) },
    { label: "CPC", value: summary.overallCPC > 0 ? fmtMoney(summary.overallCPC) : "—" },
    { label: "ACTIVE ADS", value: String(summary.activeAds) },
  ];

  let y = 38;
  const cardW = (pageW - 20 - 7 * 3) / 8;

  cards.forEach((card, i) => {
    const x = 10 + i * (cardW + 3);
    doc.setFillColor(245, 246, 250);
    doc.roundedRect(x, y, cardW, 18, 1, 1, "F");
    doc.setTextColor(120, 120, 140);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.text(card.label, x + 2, y + 5);
    doc.setTextColor(10, 10, 20);
    doc.setFontSize(9);
    doc.text(card.value, x + 2, y + 13);
  });

  y += 24;

  doc.setFillColor(29, 78, 216);
  doc.roundedRect(10, y, pageW - 20, 8, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("  AD PERFORMANCE BREAKDOWN", 15, y + 5.5);
  y += 12;

  autoTable(doc, {
    startY: y,
    head: [[
      "Ad Name",
      "Campaign",
      "Ad Set",
      "Spend",
      "Reach",
      "Impressions",
      "Clicks",
      "CTR",
      "CPM",
      "CPC",
      "Likes",
      "Comments",
      "Shares",
      "Video Views",
    ]],
    body: ads.map((ad) => [
      ad.name,
      ad.campaignName,
      ad.adSetName,
      fmtMoney(ad.insights.spend),
      fmt(ad.insights.reach),
      fmt(ad.insights.impressions),
      fmt(ad.insights.clicks),
      fmtPct(ad.insights.ctr),
      fmtMoney(ad.insights.cpm),
      ad.insights.cpc > 0 ? fmtMoney(ad.insights.cpc) : "—",
      fmt(ad.insights.likes),
      fmt(ad.insights.comments),
      fmt(ad.insights.shares),
      fmt(ad.insights.videoViews),
    ]),
    styles: {
      fontSize: 7,
      cellPadding: 2.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 10, right: 10 },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 10;
  const nextY = finalY + 10;

  doc.setFillColor(29, 78, 216);
  doc.roundedRect(10, nextY, pageW - 20, 8, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("  CAMPAIGN / AD SET SUMMARY", 15, nextY + 5.5);

  autoTable(doc, {
    startY: nextY + 12,
    head: [["Campaign", "Objective", "Ad Sets", "Ads", "Spend", "Reach"]],
    body: campaigns.map((campaign) => {
      const campaignAds = campaign.adSets.flatMap((a) => a.ads);
      return [
        campaign.name,
        campaign.objective || "—",
        String(campaign.adSets.length),
        String(campaignAds.length),
        fmtMoney(campaignAds.reduce((sum, ad) => sum + ad.insights.spend, 0)),
        fmt(campaignAds.reduce((sum, ad) => sum + ad.insights.reach, 0)),
      ];
    }),
    styles: {
      fontSize: 7,
      cellPadding: 2.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 10, right: 10 },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setTextColor(140, 140, 160);
    doc.setFontSize(7);
    doc.text(`Page ${i} of ${totalPages}`, pageW - 12, doc.internal.pageSize.getHeight() - 2.5, {
      align: "right",
    });
  }

  doc.save(`bludash_performance_${client}_${from}_${to}.pdf`);
}

export default function PerformanceReport({ client, from, to, dark, onBack }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("flat");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
const { state: manusState, generateReport, dismiss: dismissManus } = useManusReport();
const isGeneratingManus =
  manusState.status === "creating" || manusState.status === "running" || manusState.status === "waiting";

  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);

  const { loading, error, ads: allAds, campaigns, token: cfgToken } =
    useAdsPerformance(client, from, to);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

 


  const filteredAds = allAds
    .filter((ad) => {
      const q = search.toLowerCase();
      const matchSearch =
        ad.name.toLowerCase().includes(q) ||
        ad.campaignName.toLowerCase().includes(q) ||
        ad.adSetName.toLowerCase().includes(q);

      const matchStatus = statusFilter === "ALL" || ad.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      const getVal = (ad: Ad) =>
        sortKey === "spend"
          ? ad.insights.spend
          : sortKey === "reach"
            ? ad.insights.reach
            : sortKey === "impressions"
              ? ad.insights.impressions
              : sortKey === "clicks"
                ? ad.insights.clicks
                : sortKey === "ctr"
                  ? ad.insights.ctr
                  : sortKey === "cpm"
                    ? ad.insights.cpm
                    : sortKey === "cpc"
                      ? ad.insights.cpc
                      : sortKey === "likes"
                        ? ad.insights.likes
                        : sortKey === "comments"
                          ? ad.insights.comments
                          : sortKey === "shares"
                            ? ad.insights.shares
                            : ad.insights.videoViews;

      const aVal = getVal(a);
      const bVal = getVal(b);
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });

  const totalSpend = allAds.reduce((s, a) => s + a.insights.spend, 0);
  const totalReach = allAds.reduce((s, a) => s + a.insights.reach, 0);
  const totalImpressions = allAds.reduce((s, a) => s + a.insights.impressions, 0);
  const totalClicks = allAds.reduce((s, a) => s + a.insights.clicks, 0);
  const totalLikes = allAds.reduce((s, a) => s + a.insights.likes, 0);
  const totalComments = allAds.reduce((s, a) => s + a.insights.comments, 0);
  const totalShares = allAds.reduce((s, a) => s + a.insights.shares, 0);
  const totalVideoViews = allAds.reduce((s, a) => s + a.insights.videoViews, 0);

  const overallCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const overallCPM = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const overallCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;

  const activeAds = allAds.filter((a) => a.status === "ACTIVE").length;

  const summary = {
    totalSpend,
    totalReach,
    totalImpressions,
    totalClicks,
    overallCTR,
    overallCPM,
    overallCPC,
    activeAds,
  };

  const fromLabel = new Date(from).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const toLabel = new Date(to).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const iconProps = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    xmlns: "http://www.w3.org/2000/svg",
  };

  const iconCls = dark ? "text-white/40" : "text-slate-500";

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className={`w-full max-w-sm rounded-full h-1.5 ${dark ? "bg-white/[0.06]" : "bg-black/[0.06]"}`}>
          <div className="h-1.5 rounded-full bg-blue-500 transition-all duration-500" style={{ width: "100%" }} />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  i < 5 ? "bg-blue-500" : dark ? "bg-white/10" : "bg-black/10"
                }`}
              />
            ))}
          </div>
          <p className={`text-[13px] font-medium ${dark ? "text-white/60" : "text-black/50"}`}>
            Loading performance data...
          </p>
          <p className={`text-[11px] ${dark ? "text-white/25" : "text-black/25"}`}>
            Fetching Meta Ads metrics
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-red-400"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-[13px] text-red-400">{error}</p>
        </div>

        <button
          onClick={onBack}
          className={`text-[12px] px-4 py-2 rounded-lg border transition-all ${
            dark
              ? "border-white/10 text-white/40 hover:text-white/80"
              : "border-black/10 text-black/40 hover:text-black/70"
          }`}
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1300px] mx-auto flex flex-col gap-6 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onBack}
          className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition-all ${
            dark
              ? "border-white/10 text-white/40 hover:text-white/80 hover:border-white/20"
              : "border-black/10 text-black/40 hover:text-black/70"
          }`}
        >
          ← Back
        </button>

        <div className="flex items-center gap-2">
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-black/10"}`} />
          <span className={`text-[11px] tracking-widest uppercase font-medium ${dark ? "text-white/25" : "text-black/25"}`}>
            Performance Report · {fromLabel} — {toLabel}
          </span>
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-black/10"}`} />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setExportingCSV(true);
              exportCSV(filteredAds, client, from, to);
              setExportingCSV(false);
            }}
            disabled={exportingCSV}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 ${
              dark
                ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                : "border-emerald-600/30 text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            <svg {...iconProps} className={dark ? "text-emerald-400" : "text-emerald-700"}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Export CSV
          </button>

          <button
            onClick={async () => {
              setExportingPDF(true);
              await exportPDF(filteredAds, campaigns, summary, client, from, to);
              setExportingPDF(false);
            }}
            disabled={exportingPDF}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 ${
              dark
                ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                : "border-blue-600/30 text-blue-700 hover:bg-blue-50"
            }`}
          >
            {exportingPDF ? (
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg {...iconProps} className={dark ? "text-blue-400" : "text-blue-700"}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            )}
            Export PDF
          </button>

          <button
  onClick={() =>
    generateReport({ type: "Performance Report", client, from, to })
  }
  disabled={isGeneratingManus}
  className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 ${
    dark
      ? "border-fuchsia-500/30 text-fuchsia-400 hover:bg-fuchsia-500/10"
      : "border-fuchsia-600/30 text-fuchsia-700 hover:bg-fuchsia-50"
  }`}
>
  {isGeneratingManus ? (
    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8L12 3z" />
    </svg>
  )}
  {isGeneratingManus
    ? manusState.brief || "Generating…"
    : "ManusAI Report PDF"}
</button>

        </div>
      </div>


      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <SummaryCard
          label="Total Spend"
          value={fmtMoney(totalSpend)}
          sub={`${allAds.length} ads total`}
          dark={dark}
          icon={
            <svg {...iconProps} className={iconCls}>
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
        <SummaryCard
          label="Total Reach"
          value={fmt(totalReach)}
          dark={dark}
          icon={
            <svg {...iconProps} className={iconCls}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <SummaryCard
          label="Impressions"
          value={fmt(totalImpressions)}
          dark={dark}
          icon={
            <svg {...iconProps} className={iconCls}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          }
        />
        <SummaryCard
          label="Clicks"
          value={fmt(totalClicks)}
          dark={dark}
          icon={
            <svg {...iconProps} className={iconCls}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
        />
        <SummaryCard
          label="CTR"
          value={fmtPct(overallCTR)}
          accent={
            overallCTR >= 1.5
              ? dark
                ? "text-emerald-400"
                : "text-emerald-600"
              : overallCTR < 0.8
                ? dark
                  ? "text-red-400"
                  : "text-red-600"
                : dark
                  ? "text-yellow-400"
                  : "text-yellow-600"
          }
          dark={dark}
          icon={
            <svg {...iconProps} className={iconCls}>
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          }
        />
        <SummaryCard
          label="CPM"
          value={fmtMoney(overallCPM)}
          dark={dark}
          icon={
            <svg {...iconProps} className={iconCls}>
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          }
        />
        <SummaryCard
          label="CPC"
          value={overallCPC > 0 ? fmtMoney(overallCPC) : "—"}
          dark={dark}
          icon={
            <svg {...iconProps} className={iconCls}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          }
        />
        <SummaryCard
          label="Active Ads"
          value={String(activeAds)}
          sub={`of ${allAds.length} total`}
          accent={dark ? "text-blue-400" : "text-blue-600"}
          dark={dark}
          icon={
            <svg {...iconProps} className={iconCls}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
        />
      </div>

      <div
        className={`rounded-xl border px-4 py-3 flex items-center gap-6 flex-wrap ${
          dark
            ? "border-white/[0.08] bg-[#1a1a2e]"
            : "border-black/[0.1] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
        }`}
      >
        <span className={`text-[10px] font-semibold tracking-widest uppercase ${dark ? "text-white/30" : "text-slate-400"}`}>
          Engagement Totals
        </span>
        {[
          { label: "Likes", value: fmt(totalLikes) },
          { label: "Comments", value: fmt(totalComments) },
          { label: "Shares", value: fmt(totalShares) },
          { label: "Video Views", value: fmt(totalVideoViews) },
          { label: "Campaigns", value: String(campaigns.length) },
          { label: "Ad Sets", value: String(campaigns.reduce((s, c) => s + c.adSets.length, 0)) },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex flex-col ${dark ? "text-white" : "text-slate-900"}`}>
              <span className={`text-[10px] ${dark ? "text-white/25" : "text-slate-400"}`}>{item.label}</span>
              <span className="text-[15px] font-bold tabular-nums">{item.value}</span>
            </div>
            {i < 5 && <div className={`w-px h-5 ${dark ? "bg-white/[0.06]" : "bg-black/10"}`} />}
          </div>
        ))}
      </div>

      <div className={`h-px w-full ${dark ? "bg-white/[0.05]" : "bg-black/[0.05]"}`} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${dark ? "text-white/25" : "text-black/25"}`}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ads, campaigns, ad sets..."
              className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none transition-all ${
                dark
                  ? "bg-white/[0.03] border border-white/[0.07] text-white placeholder:text-white/20 focus:border-blue-500/40"
                  : "bg-white/80 border border-slate-200 text-slate-900 placeholder:text-black/20 focus:border-blue-500/40"
              }`}
            />
          </div>

          <div className={`flex rounded-xl p-1 gap-1 ${dark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-black/[0.03] border border-black/[0.06]"}`}>
            {["ALL", "ACTIVE", "PAUSED", "ARCHIVED"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all ${
                  statusFilter === s
                    ? s === "ACTIVE"
                      ? "bg-emerald-600 text-white"
                      : s === "PAUSED"
                        ? "bg-yellow-600 text-white"
                        : s === "ARCHIVED"
                          ? "bg-slate-600 text-white"
                          : "bg-blue-600 text-white"
                    : dark
                      ? "text-white/30 hover:text-white/60"
                      : "text-black/30 hover:text-black/60"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className={`flex rounded-xl p-1 gap-1 ${dark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-black/[0.03] border border-black/[0.06]"}`}>
            <button
              onClick={() => setViewMode("flat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                viewMode === "flat"
                  ? "bg-blue-600 text-white"
                  : dark
                    ? "text-white/35 hover:text-white/60"
                    : "text-black/35 hover:text-black/60"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              Flat Table
            </button>

            <button
              onClick={() => setViewMode("grouped")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                viewMode === "grouped"
                  ? "bg-blue-600 text-white"
                  : dark
                    ? "text-white/35 hover:text-white/60"
                    : "text-black/35 hover:text-black/60"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              Grouped
            </button>
          </div>
        </div>

        {viewMode === "flat" && (
          <div className="flex flex-wrap gap-2">
            {([
              { key: "spend", label: "Top Spend" },
              { key: "reach", label: "Top Reach" },
              { key: "impressions", label: "Top Impressions" },
              { key: "clicks", label: "Top Clicks" },
              { key: "ctr", label: "Best CTR" },
              { key: "ctr", label: "Worst CTR", dir: "asc" },
              { key: "cpm", label: "Lowest CPM", dir: "asc" },
              { key: "cpc", label: "Lowest CPC", dir: "asc" },
              { key: "likes", label: "Top Likes" },
              { key: "videoViews", label: "Top Views" },
            ] as { key: SortKey; label: string; dir?: SortDir }[]).map((s, i) => {
              const isActive = sortKey === s.key && sortDir === (s.dir || "desc");
              return (
                <button
                  key={i}
                  onClick={() => {
                    setSortKey(s.key);
                    setSortDir(s.dir || "desc");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all ${
                    isActive
                      ? "bg-blue-600 text-white shadow-[0_2px_10px_rgba(59,130,246,0.3)]"
                      : dark
                        ? "bg-white/[0.04] text-white/30 hover:text-white/60 border border-white/[0.06]"
                        : "bg-black/[0.04] text-black/30 hover:text-black/60 border border-black/[0.06]"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}

        <p className={`text-[11px] ${dark ? "text-white/20" : "text-slate-400"}`}>
          Showing {viewMode === "flat" ? filteredAds.length : allAds.length} ads
          {statusFilter !== "ALL" ? ` · ${statusFilter}` : ""}
          {search ? ` · matching "${search}"` : ""}
        </p>
      </div>

      {viewMode === "flat" ? (
        <FlatTable
          ads={filteredAds}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          dark={dark}
          onRowClick={(ad) => setSelectedAd(ad)}
        />
      ) : (
        <GroupedView campaigns={campaigns} dark={dark} onAdClick={(ad) => setSelectedAd(ad)} />
      )}

      {allAds.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className={`text-[13px] ${dark ? "text-white/30" : "text-slate-400"}`}>
            No ads found for this period.
          </p>
        </div>
      )}

      {selectedAd && (
        <AdModal
          ad={selectedAd}
          onClose={() => setSelectedAd(null)}
          dark={dark}
          token={cfgToken}
        />
      )}
      <ManusReportToast
  state={manusState}
  onDismiss={dismissManus}
  dark={dark}
/>
    </div>
  );
}
