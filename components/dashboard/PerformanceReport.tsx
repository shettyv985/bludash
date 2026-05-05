// C:\Users\Varun Shetty\Desktop\New folder\bludash\components\dashboard\PerformanceReport.tsx
"use client";

import { useState, useEffect, type ReactNode } from "react";
import AdModal from "./AdModal";
import {
  useAdsPerformance,
  type Ad,
  type AdInsight,
  type Campaign,
} from "./useAdsPerformance";
import { useManusReport } from "./useManusReport";
import ManusReportToast from "./ManusReportToast";
import { buildReportPayload } from "@/lib/buildReportPayload";
import { generateReportPDF } from "@/lib/generateReportPDF";
import { getPreviousMonthComparisonRange } from "@/lib/dateComparison";

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
  | "videoViews"
  | "leads"
  | "cpl"
  | "landingPageViews"
  | "postEngagements";

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

function getCPLHighlight(cpl: number): "good" | "warn" | "bad" {
  return cpl < 100 ? "good" : cpl < 300 ? "warn" : "bad";
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
      className={`rounded-[20px] border p-4 transition-colors ${
        dark
          ? "border-blue-400/20 bg-[linear-gradient(145deg,rgba(18,26,52,0.98),rgba(10,14,28,0.95))] shadow-[0_16px_40px_rgba(37,99,235,0.18)]"
          : "border-blue-200 bg-[linear-gradient(145deg,#ffffff,#eff6ff)] shadow-[0_16px_40px_rgba(37,99,235,0.10)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className={`text-[10px] font-semibold tracking-[0.08em] uppercase truncate ${dark ? "text-white/55" : "text-slate-500"}`}>
          {label}
        </p>
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${dark ? "bg-white/[0.07]" : "bg-blue-100"}`}>
          {icon}
        </div>
      </div>
      <p className={`text-[20px] sm:text-[22px] font-bold leading-none tracking-[-0.02em] break-all ${accent || (dark ? "text-white" : "text-slate-950")}`}>
  {value}
</p>
      {sub && (
        <div className={`mt-4 rounded-xl px-3 py-2 border ${dark ? "border-white/[0.06] bg-white/[0.04]" : "border-slate-200/80 bg-slate-50/80"}`}>
          <p className={`text-[10px] leading-relaxed font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>{sub}</p>
        </div>
      )}
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
          <td className={`px-3 py-3 min-w-[120px] max-w-[160px] text-[11px] truncate ${dark ? "text-white/40" : "text-slate-500"}`}>
            {ad.campaignName}
          </td>
          <td className={`px-3 py-3 min-w-[120px] max-w-[160px] text-[11px] truncate ${dark ? "text-white/40" : "text-slate-500"}`}>
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
        <MetricCell
          value={ins.leads > 0 ? fmt(ins.leads) : "—"}
          highlight={ins.leads > 0 ? "good" : null}
          dark={dark}
        />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell
          value={ins.cpl > 0 ? fmtMoney(ins.cpl) : "—"}
          highlight={ins.cpl > 0 ? getCPLHighlight(ins.cpl) : null}
          dark={dark}
        />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={ins.landingPageViews > 0 ? fmt(ins.landingPageViews) : "—"} dark={dark} />
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <MetricCell value={ins.postEngagements > 0 ? fmt(ins.postEngagements) : "—"} dark={dark} />
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
    "", "Ad",
    "Spend", "Reach", "Impressions", "Clicks", "CTR", "CPM", "CPC",
    "Leads", "CPL", "LP Views", "Engagements",
    "Likes", "Comments", "Shares", "Video Views",
  ];

  const rightAlign = new Set([
    "Spend", "Reach", "Impressions", "Clicks", "CTR", "CPM", "CPC",
    "Leads", "CPL", "LP Views", "Engagements",
    "Likes", "Comments", "Shares", "Video Views",
  ]);

  return (
    <div className="flex flex-col gap-3">
      {campaigns.map((camp) => {
        const campOpen = openCampaigns[camp.id] !== false;
        const campAds = camp.adSets.flatMap((s) => s.ads);
        const campSpend = campAds.reduce((s, a) => s + a.insights.spend, 0);
        const campReach = campAds.reduce((s, a) => s + a.insights.reach, 0);
        const campLeads = campAds.reduce((s, a) => s + a.insights.leads, 0);

        return (
          <div
            key={camp.id}
            className={`rounded-[20px] border overflow-hidden ${
              dark
                ? "border-white/[0.08] bg-[#0f0f1a]"
                : "border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.07)]"
            }`}
          >
            <button
              onClick={() => toggleCampaign(camp.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                dark ? "bg-[#1a1a2e] hover:bg-[#1e1e35]" : "bg-[linear-gradient(135deg,#eff6ff,#f8fafc)] hover:bg-blue-50"
              }`}
            >
              <div
                className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-transform ${
                  campOpen ? "rotate-90" : ""
                } ${dark ? "bg-white/[0.06]" : "bg-slate-200"}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={dark ? "text-white/50" : "text-slate-500"}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>

              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <span className={`text-[13px] font-semibold truncate ${dark ? "text-white/90" : "text-slate-800"}`}>
                  {camp.name}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${dark ? "bg-blue-500/15 text-blue-400" : "bg-blue-100 text-blue-700"}`}>
                  {camp.objective}
                </span>
                <StatusBadge status={camp.status} dark={dark} />
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <p className={`text-[10px] ${dark ? "text-white/25" : "text-slate-400"}`}>Spend</p>
                  <p className={`text-[12px] font-bold ${dark ? "text-white/70" : "text-slate-700"}`}>{fmtMoney(campSpend)}</p>
                </div>
                <div className="text-right">
                  <p className={`text-[10px] ${dark ? "text-white/25" : "text-slate-400"}`}>Reach</p>
                  <p className={`text-[12px] font-bold ${dark ? "text-white/70" : "text-slate-700"}`}>{fmt(campReach)}</p>
                </div>
                {campLeads > 0 && (
                  <div className="text-right">
                    <p className={`text-[10px] ${dark ? "text-white/25" : "text-slate-400"}`}>Leads</p>
                    <p className={`text-[12px] font-bold ${dark ? "text-emerald-400" : "text-emerald-600"}`}>{fmt(campLeads)}</p>
                  </div>
                )}
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
                  const setLeads = setAds.reduce((s, a) => s + a.insights.leads, 0);

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
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-transform ${setOpen ? "rotate-90" : ""} ${dark ? "bg-white/[0.04]" : "bg-slate-200"}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={dark ? "text-white/40" : "text-slate-500"}>
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
                        {setLeads > 0 && (
                          <span className={`text-[10px] font-bold ${dark ? "text-emerald-400" : "text-emerald-600"}`}>
                            {setLeads} leads
                          </span>
                        )}
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
                                    } ${dark ? "text-white/30" : "text-slate-400"} ${
                                      ["Leads", "CPL"].includes(h)
                                        ? dark ? "text-emerald-400/60" : "text-emerald-600/70"
                                        : ""
                                    }`}
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
  const headers: { label: string; key?: SortKey; right?: boolean; accent?: boolean }[] = [
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
    { label: "Leads", key: "leads", right: true, accent: true },
    { label: "CPL", key: "cpl", right: true, accent: true },
    { label: "LP Views", key: "landingPageViews", right: true },
    { label: "Engagements", key: "postEngagements", right: true },
    { label: "Likes", key: "likes", right: true },
    { label: "Comments", key: "comments", right: true },
    { label: "Shares", key: "shares", right: true },
    { label: "Video Views", key: "videoViews", right: true },
  ];

  return (
    <div
      className={`rounded-[20px] border overflow-hidden ${
        dark
          ? "border-white/[0.08] bg-[#0f0f1a]"
          : "border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]"
      }`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
<tr className={dark ? "bg-[#1a1a2e] border-b border-white/[0.08]" : "bg-slate-50 border-b border-slate-200"}>
              {headers.map((h) => {
                const active = h.key === sortKey;
                return (
                  <th
                    key={h.label}
                    className={`px-4 py-2.5 text-[9px] font-bold tracking-widest uppercase ${
                      h.right ? "text-right" : "text-left"
                    } ${
                      h.accent
                        ? dark ? "text-emerald-400/70" : "text-emerald-600/80"
                        : dark ? "text-white/30" : "text-slate-400"
                    }`}
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
    "Ad Name", "Status", "Campaign", "Ad Set",
    "Spend", "Reach", "Impressions", "Clicks", "CTR", "CPM", "CPC",
    "Leads", "CPL", "Landing Page Views", "Post Engagements",
    "Likes", "Comments", "Shares", "Video Views",
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
    ad.insights.leads,
    ad.insights.cpl.toFixed(2),
    ad.insights.landingPageViews,
    ad.insights.postEngagements,
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
    adsInPeriod: number;
    totalLeads: number;
    overallCPL: number;
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
    { label: "IMPRESSIONS", value: fmt(summary.totalImpressions) },
    { label: "CLICKS", value: fmt(summary.totalClicks) },
    { label: "CTR", value: fmtPct(summary.overallCTR) },
    { label: "CPM", value: fmtMoney(summary.overallCPM) },
    { label: "CPC", value: summary.overallCPC > 0 ? fmtMoney(summary.overallCPC) : "—" },
    { label: "TOTAL LEADS", value: String(summary.totalLeads) },
    { label: "CPL", value: summary.overallCPL > 0 ? fmtMoney(summary.overallCPL) : "—" },
    { label: "ACTIVE ADS", value: String(summary.activeAds) },
    { label: "ADS IN PERIOD", value: String(summary.adsInPeriod) },
  ];

  let y = 38;
  const cardCount = cards.length;
  const cardW = (pageW - 20 - (cardCount - 1) * 2) / cardCount;

  cards.forEach((card, i) => {
    const x = 10 + i * (cardW + 2);
    const isLeadCard = card.label === "TOTAL LEADS" || card.label === "CPL";
    doc.setFillColor(isLeadCard ? 236 : 245, isLeadCard ? 253 : 246, isLeadCard ? 243 : 250);
    doc.roundedRect(x, y, cardW, 18, 1, 1, "F");
    doc.setTextColor(isLeadCard ? 4 : 120, isLeadCard ? 120 : 120, isLeadCard ? 80 : 140);
    doc.setFontSize(5);
    doc.setFont("helvetica", "bold");
    doc.text(card.label, x + 2, y + 5);
    doc.setTextColor(isLeadCard ? 5 : 10, isLeadCard ? 150 : 10, isLeadCard ? 80 : 20);
    doc.setFontSize(8.5);
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
      "Ad Name", "Campaign", "Ad Set",
      "Spend", "Reach", "Impressions", "Clicks", "CTR", "CPM", "CPC",
      "Leads", "CPL", "LP Views", "Engagements",
      "Likes", "Comments", "Shares", "Vid Views",
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
      ad.insights.leads > 0 ? fmt(ad.insights.leads) : "—",
      ad.insights.cpl > 0 ? fmtMoney(ad.insights.cpl) : "—",
      ad.insights.landingPageViews > 0 ? fmt(ad.insights.landingPageViews) : "—",
      ad.insights.postEngagements > 0 ? fmt(ad.insights.postEngagements) : "—",
      fmt(ad.insights.likes),
      fmt(ad.insights.comments),
      fmt(ad.insights.shares),
      fmt(ad.insights.videoViews),
    ]),
    styles: { fontSize: 6, cellPadding: 1.8, overflow: "linebreak" },
    headStyles: { fillColor: [29, 78, 216], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      10: { textColor: [5, 150, 80], fontStyle: "bold" },
      11: { textColor: [5, 150, 80], fontStyle: "bold" },
    },
    margin: { left: 10, right: 10 },
  });

  const finalY =
    (doc as unknown as InstanceType<typeof jsPDF> & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 10;
  const nextY = finalY + 10;

  doc.setFillColor(29, 78, 216);
  doc.roundedRect(10, nextY, pageW - 20, 8, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("  CAMPAIGN / AD SET SUMMARY", 15, nextY + 5.5);

  autoTable(doc, {
    startY: nextY + 12,
    head: [["Campaign", "Objective", "Ad Sets", "Ads", "Spend", "Reach", "Leads", "CPL"]],
    body: campaigns.map((campaign) => {
      const campaignAds = campaign.adSets.flatMap((a) => a.ads);
      const campSpend = campaignAds.reduce((sum, ad) => sum + ad.insights.spend, 0);
      const campLeads = campaignAds.reduce((sum, ad) => sum + ad.insights.leads, 0);
      const campCPL = campLeads > 0 ? campSpend / campLeads : 0;
      return [
        campaign.name,
        campaign.objective || "—",
        String(campaign.adSets.length),
        String(campaignAds.length),
        fmtMoney(campSpend),
        fmt(campaignAds.reduce((sum, ad) => sum + ad.insights.reach, 0)),
        campLeads > 0 ? fmt(campLeads) : "—",
        campCPL > 0 ? fmtMoney(campCPL) : "—",
      ];
    }),
    styles: { fontSize: 7, cellPadding: 2.2, overflow: "linebreak" },
    headStyles: { fillColor: [29, 78, 216], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      6: { textColor: [5, 150, 80], fontStyle: "bold" },
      7: { textColor: [5, 150, 80], fontStyle: "bold" },
    },
    margin: { left: 10, right: 10 },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setTextColor(140, 140, 160);
    doc.setFontSize(7);
    doc.text(`Page ${i} of ${totalPages}`, pageW - 12, doc.internal.pageSize.getHeight() - 2.5, { align: "right" });
  }

  doc.save(`bludash_performance_${client}_${from}_${to}.pdf`);
}
type PerformanceSummary = {
  totalSpend: number;
  totalReach: number;
  totalImpressions: number;
  totalClicks: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalVideoViews: number;
  totalLeads: number;
  totalLandingPageViews: number;
  totalPostEngagements: number;
  overallCTR: number;
  overallCPM: number;
  overallCPC: number;
  overallCPL: number;
  activeAds: number;
  adsInPeriod: number;
  totalAds: number;
};

function didAdRunInPeriod(ad: Ad) {
  return (
    ad.insights.impressions > 0 ||
    ad.insights.spend > 0 ||
    ad.insights.reach > 0 ||
    ad.insights.clicks > 0
  );
}

function buildPerformanceSummary(ads: Ad[], accountInsight: AdInsight | null = null): PerformanceSummary {
  const summedSpend = ads.reduce((s, a) => s + a.insights.spend, 0);
  const summedReach = ads.reduce((s, a) => s + a.insights.reach, 0);
  const summedImpressions = ads.reduce((s, a) => s + a.insights.impressions, 0);
  const summedClicks = ads.reduce((s, a) => s + a.insights.clicks, 0);
  const summedLikes = ads.reduce((s, a) => s + a.insights.likes, 0);
  const summedComments = ads.reduce((s, a) => s + a.insights.comments, 0);
  const summedShares = ads.reduce((s, a) => s + a.insights.shares, 0);
  const summedVideoViews = ads.reduce((s, a) => s + a.insights.videoViews, 0);
  const summedLeads = ads.reduce((s, a) => s + a.insights.leads, 0);
  const summedLandingPageViews = ads.reduce((s, a) => s + a.insights.landingPageViews, 0);
  const summedPostEngagements = ads.reduce((s, a) => s + a.insights.postEngagements, 0);

  const totalSpend = accountInsight?.spend ?? summedSpend;
  const totalReach = accountInsight?.reach ?? summedReach;
  const totalImpressions = accountInsight?.impressions ?? summedImpressions;
  const totalClicks = accountInsight?.clicks ?? summedClicks;
  const totalLikes = accountInsight?.likes ?? summedLikes;
  const totalComments = accountInsight?.comments ?? summedComments;
  const totalShares = accountInsight?.shares ?? summedShares;
  const totalVideoViews = accountInsight?.videoViews ?? summedVideoViews;
  const totalLeads = (accountInsight && accountInsight.leads > 0)
  ? accountInsight.leads
  : summedLeads;
  const totalLandingPageViews =
    accountInsight?.landingPageViews ?? summedLandingPageViews;
  const totalPostEngagements =
    accountInsight?.postEngagements ?? summedPostEngagements;

  return {
    totalSpend,
    totalReach,
    totalImpressions,
    totalClicks,
    totalLikes,
    totalComments,
    totalShares,
    totalVideoViews,
    totalLeads,
    totalLandingPageViews,
    totalPostEngagements,
    overallCTR:
      accountInsight?.ctr ?? (totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0),
    overallCPM:
      accountInsight?.cpm ?? (totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0),
    overallCPC: accountInsight?.cpc ?? (totalClicks > 0 ? totalSpend / totalClicks : 0),
    overallCPL: totalLeads > 0 ? totalSpend / totalLeads : 0,
    activeAds: ads.filter((a) => a.status === "ACTIVE").length,
    adsInPeriod: ads.filter(didAdRunInPeriod).length,
    totalAds: ads.length,
  };
}

function filterCampaignsByAds(campaigns: Campaign[], allowedAds: Ad[]) {
  const allowedIds = new Set(allowedAds.map((ad) => ad.id));

  return campaigns
    .map((campaign) => ({
      ...campaign,
      adSets: campaign.adSets
        .map((adSet) => ({
          ...adSet,
          ads: adSet.ads.filter((ad) => allowedIds.has(ad.id)),
        }))
        .filter((adSet) => adSet.ads.length > 0),
    }))
    .filter((campaign) => campaign.adSets.length > 0);
}

function formatDelta(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return "0.00% vs prev";
    return "New vs prev";
  }

  const delta = ((current - previous) / previous) * 100;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}% vs prev`;
}

function comparisonSub(
  label: string,
  current: number,
  previous: number,
  formatter: (value: number) => string
) {
  return `${label}: ${formatter(previous)} • ${formatDelta(current, previous)}`;
}

export default function PerformanceReport({ client, from, to, dark, onBack }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("flat");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  const { state: manusState, generateReport, setBuilding, dismiss: dismissManus } = useManusReport();
  const isGeneratingManus =
    manusState.status === "creating" ||
    manusState.status === "running" ||
    manusState.status === "waiting";

  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);

  const comparisonRange = getPreviousMonthComparisonRange(from, to);

  const { loading, error, ads: allAds, campaigns, accountInsight, token: cfgToken } =
    useAdsPerformance(client, from, to);

  const {
    loading: previousMonthLoading,
    ads: comparisonAds,
    accountInsight: comparisonAccountInsight,
  } =
    useAdsPerformance(client, comparisonRange.from, comparisonRange.to);




  // ── Auto-trigger PDF as soon as Manus returns reportData ──────────────────
// ── Auto-trigger Gemini HTML report as soon as Manus returns reportData ───
// ── Stage 2: As soon as Manus JSON analysis is done, kick off HTML build ──
useEffect(() => {
  if (manusState.status === "done" && manusState.reportData) {
    const payload = buildReportPayload(allAds, campaigns, client, from, to, accountInsight);
    setBuilding("Manus is now building your HTML report…");
    generateReportPDF(
      payload,
      manusState.reportData,
      client,
      from,
      to,
      (brief) => setBuilding(brief)
    )
      .then(() => dismissManus())
      .catch((err) => {
        console.error("HTML report failed:", err);
        // don't dismiss — let user see error state in toast
      });
  }
}, [manusState.status, manusState.reportData]);
// ──────────────────────────────────────────────────────────────────────────
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
      const getVal = (ad: Ad): number => {
        switch (sortKey) {
          case "spend": return ad.insights.spend;
          case "reach": return ad.insights.reach;
          case "impressions": return ad.insights.impressions;
          case "clicks": return ad.insights.clicks;
          case "ctr": return ad.insights.ctr;
          case "cpm": return ad.insights.cpm;
          case "cpc": return ad.insights.cpc;
          case "likes": return ad.insights.likes;
          case "comments": return ad.insights.comments;
          case "shares": return ad.insights.shares;
          case "videoViews": return ad.insights.videoViews;
          case "leads": return ad.insights.leads;
          case "cpl": return ad.insights.cpl;
          case "landingPageViews": return ad.insights.landingPageViews;
          case "postEngagements": return ad.insights.postEngagements;
          default: return 0;
        }
      };
      const aVal = getVal(a);
      const bVal = getVal(b);
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });

  const summary = buildPerformanceSummary(allAds, accountInsight);
const comparisonSummary = buildPerformanceSummary(comparisonAds, comparisonAccountInsight);

const totalSpend = summary.totalSpend;
const totalReach = summary.totalReach;
const totalImpressions = summary.totalImpressions;
const totalClicks = summary.totalClicks;
const totalLikes = summary.totalLikes;
const totalComments = summary.totalComments;
const totalShares = summary.totalShares;
const totalVideoViews = summary.totalVideoViews;
const totalLeads = summary.totalLeads;
const totalLandingPageViews = summary.totalLandingPageViews;
const totalPostEngagements = summary.totalPostEngagements;
const overallCTR = summary.overallCTR;
const overallCPM = summary.overallCPM;
const overallCPC = summary.overallCPC;
const overallCPL = summary.overallCPL;
const activeAds = summary.activeAds;
const adsInPeriod = summary.adsInPeriod;
const filteredCampaigns = filterCampaignsByAds(campaigns, filteredAds);

  const fromLabel = new Date(from).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const toLabel = new Date(to).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

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
  const sortTabs: { key: SortKey; label: string }[] = [
    { key: "spend", label: "Top Spend" },
    { key: "reach", label: "Top Reach" },
    { key: "impressions", label: "Top Impressions" },
    { key: "clicks", label: "Top Clicks" },
    { key: "ctr", label: "Top CTR" },
    { key: "cpm", label: "Top CPM" },
    { key: "cpc", label: "Top CPC" },
    { key: "leads", label: "Top Leads" },
    { key: "cpl", label: "Top CPL" },
    { key: "postEngagements", label: "Top Engagement" },
  ];

  const statusTabs = ["ALL", "ACTIVE", "PAUSED", "ARCHIVED"] as const;

  const handleSortTab = (key: SortKey) => {
    setSortKey(key);
    setSortDir("desc");
  };

 if (loading) {
  return (
    <div className="flex items-center justify-center min-h-[62vh] px-4">
      <div
        className={`w-full max-w-xl rounded-[28px] border p-8 relative overflow-hidden ${
          dark
            ? "bg-[#0f1220] border-white/[0.08]"
            : "bg-white border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
        }`}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-10 -left-8 w-40 h-40 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full bg-cyan-400/10 blur-3xl" />
        </div>

        <div className="relative flex flex-col items-center text-center gap-5">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border border-blue-500/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border border-cyan-400/25 animate-pulse" />
            <div className="absolute inset-[18px] rounded-full bg-blue-600 shadow-[0_0_35px_rgba(37,99,235,0.45)]" />
          </div>

          <div className="w-full max-w-md">
            <div className={`h-2 rounded-full overflow-hidden ${dark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
              <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 animate-pulse" />
            </div>
          </div>

          <div className="flex gap-2">
            {["Ads", "Campaigns", "Insights", "Compare", "Render"].map((step, i) => (
              <span
                key={step}
                className={`px-2.5 py-1 rounded-full text-[10px] tracking-wide ${
                  i < 4
                    ? "bg-blue-600 text-white"
                    : dark
                      ? "bg-white/[0.05] text-white/35"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {step}
              </span>
            ))}
          </div>

          <div>
            <p className={`text-[15px] font-semibold ${dark ? "text-white/80" : "text-slate-900"}`}>
              Building your performance report
            </p>
            <p className={`text-[12px] mt-1 ${dark ? "text-white/35" : "text-slate-500"}`}>
              Pulling ads, insights, and previous-month comparison data
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-[13px] text-red-400">{error}</p>
        </div>
        <button onClick={onBack} className={`text-[12px] px-4 py-2 rounded-lg border transition-all ${dark ? "border-white/10 text-white/40 hover:text-white/80" : "border-slate-300 text-slate-500 hover:text-slate-800"}`}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1300px] mx-auto flex flex-col gap-6 pb-16">
      {/* Header */}
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
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-slate-200"}`} />
          <span className={`text-[11px] tracking-widest uppercase font-medium ${dark ? "text-white/25" : "text-slate-400"}`}>
            Performance Report · {fromLabel} — {toLabel}
          </span>
          <div className={`h-px w-8 ${dark ? "bg-white/10" : "bg-black/10"}`} />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setExportingCSV(true); exportCSV(filteredAds, client, from, to); setExportingCSV(false); }}
            disabled={exportingCSV}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 ${dark ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border-emerald-600/30 text-emerald-700 hover:bg-emerald-50"}`}
          >
            <svg {...iconProps} className={dark ? "text-emerald-400" : "text-emerald-700"}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Export CSV
          </button>

          <button
            onClick={async () => { setExportingPDF(true); await exportPDF(filteredAds, filteredCampaigns, summary, client, from, to); setExportingPDF(false); }}
            disabled={exportingPDF}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 ${dark ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10" : "border-blue-600/30 text-blue-700 hover:bg-blue-50"}`}
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
            onClick={async () => {
              const payload = buildReportPayload(allAds, campaigns, client, from, to, accountInsight);
              generateReport(payload);
            }}
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
            {isGeneratingManus ? manusState.brief || "Analyzing…" : "Deep Report PDF"}
          </button>
        </div>
      </div>

      {/* Summary Cards — Row 1 */}
     <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3">
  <SummaryCard
    label="Total Spend"
    value={fmtMoney(totalSpend)}
    sub={
      previousMonthLoading
        ? "Loading previous-month comparison..."
        : comparisonSub(
            `${comparisonRange.from} to ${comparisonRange.to}`,
            totalSpend,
            comparisonSummary.totalSpend,
            fmtMoney
          )
    }
    dark={dark}
    icon={<svg {...iconProps} className={iconCls}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
  />
  <SummaryCard
    label="Total Reach"
    value={fmt(totalReach)}
    sub={
      previousMonthLoading
        ? "Loading previous-month comparison..."
        : comparisonSub(
            `${comparisonRange.from} to ${comparisonRange.to}`,
            totalReach,
            comparisonSummary.totalReach,
            (value) => fmt(value)
          )
    }
    dark={dark}
    icon={<svg {...iconProps} className={iconCls}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
  />
  <SummaryCard
    label="Impressions"
    value={fmt(totalImpressions)}
    sub={
      previousMonthLoading
        ? "Loading previous-month comparison..."
        : comparisonSub(
            `${comparisonRange.from} to ${comparisonRange.to}`,
            totalImpressions,
            comparisonSummary.totalImpressions,
            (value) => fmt(value)
          )
    }
    dark={dark}
    icon={<svg {...iconProps} className={iconCls}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
  />
  <SummaryCard
    label="Clicks"
    value={fmt(totalClicks)}
    sub={
      previousMonthLoading
        ? "Loading previous-month comparison..."
        : comparisonSub(
            `${comparisonRange.from} to ${comparisonRange.to}`,
            totalClicks,
            comparisonSummary.totalClicks,
            (value) => fmt(value)
          )
    }
    dark={dark}
    icon={<svg {...iconProps} className={iconCls}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
  />
  <SummaryCard
    label="CTR"
    value={fmtPct(overallCTR)}
    sub={
      previousMonthLoading
        ? "Loading previous-month comparison..."
        : comparisonSub(
            `${comparisonRange.from} to ${comparisonRange.to}`,
            overallCTR,
            comparisonSummary.overallCTR,
            (value) => fmtPct(value)
          )
    }
    accent={overallCTR >= 1.5 ? (dark ? "text-emerald-400" : "text-emerald-600") : overallCTR < 0.8 ? (dark ? "text-red-400" : "text-red-600") : (dark ? "text-yellow-400" : "text-yellow-600")}
    dark={dark}
    icon={<svg {...iconProps} className={iconCls}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>}
  />
  <SummaryCard
    label="CPM"
    value={fmtMoney(overallCPM)}
    sub={
      previousMonthLoading
        ? "Loading previous-month comparison..."
        : comparisonSub(
            `${comparisonRange.from} to ${comparisonRange.to}`,
            overallCPM,
            comparisonSummary.overallCPM,
            fmtMoney
          )
    }
    dark={dark}
    icon={<svg {...iconProps} className={iconCls}><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>}
  />
  <SummaryCard
    label="CPC"
    value={overallCPC > 0 ? fmtMoney(overallCPC) : "—"}
    sub={
      previousMonthLoading
        ? "Loading previous-month comparison..."
        : comparisonSub(
            `${comparisonRange.from} to ${comparisonRange.to}`,
            overallCPC,
            comparisonSummary.overallCPC,
            fmtMoney
          )
    }
    dark={dark}
    icon={<svg {...iconProps} className={iconCls}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>}
  />
  <SummaryCard
    label="Active Ads"
    value={String(activeAds)}
    sub={
      previousMonthLoading
        ? `of ${allAds.length} total`
        : `${comparisonSummary.activeAds} last month • ${formatDelta(activeAds, comparisonSummary.activeAds)}`
    }
    accent={dark ? "text-blue-400" : "text-blue-600"}
    dark={dark}
    icon={<svg {...iconProps} className={iconCls}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
  />
  <SummaryCard
    label="Ads Ran In Period"
    value={String(adsInPeriod)}
    sub={
      previousMonthLoading
        ? "Ads with spend or impressions in this range"
        : `${comparisonSummary.adsInPeriod} last month â€¢ ${formatDelta(adsInPeriod, comparisonSummary.adsInPeriod)}`
    }
    accent={dark ? "text-cyan-400" : "text-cyan-600"}
    dark={dark}
    icon={<svg {...iconProps} className={iconCls}><path d="M3 12h18" /><path d="M12 3v18" /></svg>}
  />
</div>

<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  <SummaryCard
    label="Total Leads"
    value={totalLeads > 0 ? fmt(totalLeads) : "—"}
    sub={
      previousMonthLoading
        ? "Loading previous-month comparison..."
        : comparisonSub(
            `${comparisonRange.from} to ${comparisonRange.to}`,
            totalLeads,
            comparisonSummary.totalLeads,
            (value) => fmt(value)
          )
    }
    accent={dark ? "text-emerald-400" : "text-emerald-600"}
    dark={dark}
    icon={
      <svg {...iconProps} className={dark ? "text-emerald-400" : "text-emerald-600"}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    }
  />
  <SummaryCard
    label="Cost Per Lead"
    value={overallCPL > 0 ? fmtMoney(overallCPL) : "—"}
    sub={
      previousMonthLoading
        ? "Loading previous-month comparison..."
        : comparisonSub(
            `${comparisonRange.from} to ${comparisonRange.to}`,
            overallCPL,
            comparisonSummary.overallCPL,
            fmtMoney
          )
    }
    accent={
      overallCPL > 0
        ? overallCPL < 100
          ? dark ? "text-emerald-400" : "text-emerald-600"
          : overallCPL < 300
            ? dark ? "text-yellow-400" : "text-yellow-600"
            : dark ? "text-red-400" : "text-red-600"
        : undefined
    }
    dark={dark}
    icon={
      <svg {...iconProps} className={dark ? "text-emerald-400" : "text-emerald-600"}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    }
  />
  <SummaryCard
    label="Landing Page Views"
    value={totalLandingPageViews > 0 ? fmt(totalLandingPageViews) : "—"}
    sub={
      previousMonthLoading
        ? "Loading previous-month comparison..."
        : comparisonSub(
            `${comparisonRange.from} to ${comparisonRange.to}`,
            totalLandingPageViews,
            comparisonSummary.totalLandingPageViews,
            (value) => fmt(value)
          )
    }
    dark={dark}
    icon={
      <svg {...iconProps} className={iconCls}>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    }
  />
  <SummaryCard
    label="Post Engagements"
    value={totalPostEngagements > 0 ? fmt(totalPostEngagements) : "—"}
    sub={
      previousMonthLoading
        ? "Loading previous-month comparison..."
        : comparisonSub(
            `${comparisonRange.from} to ${comparisonRange.to}`,
            totalPostEngagements,
            comparisonSummary.totalPostEngagements,
            (value) => fmt(value)
          )
    }
    dark={dark}
    icon={
      <svg {...iconProps} className={iconCls}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    }
  />
</div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
          <div className="relative flex-1 max-w-xl">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${dark ? "text-white/25" : "text-slate-400"}`}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ad, campaign, or ad set..."
              className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm transition-all focus:outline-none ${
                dark
                  ? "bg-white/[0.03] border border-white/[0.07] text-white placeholder:text-white/20 focus:border-blue-500/40"
: "bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
              }`}
            />
          </div>

          <div className={`flex rounded-xl p-1 gap-1 w-fit ${dark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-slate-100 border border-slate-200"}`}>
            <button
              onClick={() => setViewMode("flat")}
              className={`px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200 ${
                viewMode === "flat"
                  ? "bg-blue-600 text-white shadow-[0_2px_12px_rgba(59,130,246,0.3)]"
                  : dark
                    ? "text-white/40 hover:text-white/70"
: "text-slate-500 hover:text-slate-800"
              }`}
            >
              Flat View
            </button>
            <button
              onClick={() => setViewMode("grouped")}
              className={`px-4 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200 ${
                viewMode === "grouped"
                  ? "bg-blue-600 text-white shadow-[0_2px_12px_rgba(59,130,246,0.3)]"
                  : dark
                    ? "text-white/40 hover:text-white/70"
                    : "text-black/40 hover:text-black/70"
              }`}
            >
              Grouped View
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {statusTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all duration-200 ${
                statusFilter === tab
                  ? "bg-emerald-600 text-white shadow-[0_2px_10px_rgba(16,185,129,0.3)]"
                  : dark
                    ? "bg-white/[0.04] text-white/35 hover:text-white/60 border border-white/[0.06]"
                    : "bg-slate-100 text-slate-500 hover:text-slate-700 border border-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {sortTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleSortTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all duration-200 ${
                sortKey === tab.key
                  ? "bg-blue-600 text-white shadow-[0_2px_10px_rgba(59,130,246,0.3)]"
                  : dark
                    ? "bg-white/[0.04] text-white/35 hover:text-white/60 border border-white/[0.06]"
                    : "bg-slate-100 text-slate-500 hover:text-slate-700 border border-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <p className={`text-[11px] ${dark ? "text-white/25" : "text-slate-400"}`}>
          Showing {filteredAds.length.toLocaleString()} ads that ran in the selected period
        </p>
      </div>

      {viewMode === "flat" ? (
        <FlatTable ads={filteredAds} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} dark={dark} onRowClick={(ad) => setSelectedAd(ad)} />
      ) : (
        <GroupedView campaigns={filteredCampaigns} dark={dark} onAdClick={(ad) => setSelectedAd(ad)} />
      )}

      {allAds.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className={`text-[13px] ${dark ? "text-white/30" : "text-slate-400"}`}>No ads found for this period.</p>
        </div>
      )}

      {selectedAd && (
        <AdModal ad={selectedAd} onClose={() => setSelectedAd(null)} dark={dark} token={cfgToken} />
      )}
      <ManusReportToast state={manusState} onDismiss={dismissManus} dark={dark} />
    </div>
  );
}
