"use client";

// C:\Users\Varun Shetty\Desktop\New folder\bludash\components\dashboard\AIChatBot.tsx

import { useState, useRef, useEffect, useCallback } from "react";

const BASE = "https://graph.facebook.com/v25.0";

interface Post {
  id: string;
  message: string;
  createdTime: string;
  type: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: string;
  avgWatchTime?: number | null;
  boosted?: {
    adName: string;
    amountSpent: string;
    paidReach: number;
    paidLikes: number;
    paidComments: number;
    paidShares: number;
    impressions: number;
    clicks: number;
    cpm: string;
    ctr: string;
    status: string;
  } | null;
}

interface ReportData {
  client: string;
  from: string;
  to: string;
  fbPosts: Post[];
  igPosts: Post[];
  summary: {
    facebook: {
      organicLikes: number;
      organicComments: number;
      organicShares: number;
      organicReach: number;
      paidReach: number;
      totalPosts: number;
      follows: number;
      unfollows: number;
      netFollowers: number;
      pageViews: number;
    };
    instagram: {
      organicLikes: number;
      organicComments: number;
      organicShares: number;
      organicSaves: number;
      organicReach: number;
      paidLikes: number;
      paidComments: number;
      paidShares: number;
      paidReach: number;
      totalPosts: number;
      follows: number;
      unfollows: number;
      netFollowers: number;
      profileViews: number;
    };
  };
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  client: string;
  from: string;
  to: string;
  dark: boolean;
  isAdmin: boolean;
}

function igVal(data: any[], name: string): number {
  const metric = data?.find((m: any) => m.name === name);
  if (!metric) return 0;
  if (typeof metric.value === "number") return metric.value;
  if (Array.isArray(metric.values) && metric.values.length > 0) {
    return metric.values[0]?.value ?? 0;
  }
  return 0;
}

// Simple markdown renderer
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading 3
    if (line.startsWith("### ")) {
      elements.push(
        <p key={i} className="font-bold text-[13px] mt-3 mb-1">
          {renderInline(line.slice(4))}
        </p>
      );
    }
    // Heading 2
    else if (line.startsWith("## ")) {
      elements.push(
        <p key={i} className="font-bold text-[14px] mt-3 mb-1">
          {renderInline(line.slice(3))}
        </p>
      );
    }
    // Heading 1
    else if (line.startsWith("# ")) {
      elements.push(
        <p key={i} className="font-bold text-[15px] mt-3 mb-1">
          {renderInline(line.slice(2))}
        </p>
      );
    }
    // Bullet
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-2 my-0.5">
          <span className="opacity-50 mt-0.5 flex-shrink-0">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    }
    // Numbered list
    else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1];
      elements.push(
        <div key={i} className="flex gap-2 my-0.5">
          <span className="opacity-50 flex-shrink-0 w-4 text-right">{num}.</span>
          <span>{renderInline(line.replace(/^\d+\.\s/, ""))}</span>
        </div>
      );
    }
    // Horizontal rule
    else if (line.startsWith("---") || line.startsWith("***")) {
      elements.push(<hr key={i} className="my-2 border-current opacity-10" />);
    }
    // Empty line
    else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
    }
    // Normal paragraph
    else {
      elements.push(
        <p key={i} className="my-0.5 leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
    i++;
  }

  return elements;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Handle **bold**, *italic*, `code`
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const raw = match[0];
    if (raw.startsWith("**")) {
      parts.push(<strong key={match.index}>{raw.slice(2, -2)}</strong>);
    } else if (raw.startsWith("*")) {
      parts.push(<em key={match.index}>{raw.slice(1, -1)}</em>);
    } else if (raw.startsWith("`")) {
      parts.push(
        <code key={match.index} className="px-1 py-0.5 rounded text-[11px] bg-black/10 dark:bg-white/10 font-mono">
          {raw.slice(1, -1)}
        </code>
      );
    }
    last = match.index + raw.length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts;
}

const SUGGESTED_QUESTIONS = [
  "Which post had the best engagement rate?",
  "What's the worst performing creative and why?",
  "How did boosted posts perform vs organic?",
  "Which reel had the highest avg watch time?",
  "Give me a summary of this period's performance",
];

export default function AIChatBot({ client, from, to, dark, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Fetch data when chat opens for the first time, or when client/dates change
  useEffect(() => {
    if (open && (!reportData || reportData.client !== client || reportData.from !== from || reportData.to !== to)) {
      fetchData();
    }
  }, [open, client, from, to]);

  // Reset on client/date change
  useEffect(() => {
    setReportData(null);
    setMessages([]);
    setFetchError("");
  }, [client, from, to]);

  const fetchData = async () => {
    if (!client || !from || !to) {
      setFetchError("Please select a client and date range first.");
      return;
    }

    setFetching(true);
    setFetchError("");

    try {
      // Fetch config
      const cfgRes = await fetch(`/api/social-media?client=${client}`);
      const cfg = await cfgRes.json();
      if (!cfg.token) throw new Error("Invalid client config");

      // Fetch ads config for boosted data
      const adsCfgRes = await fetch(`/api/ads?client=${client}`);
      const adsCfg = await adsCfgRes.json();

      // --- Fetch boosted posts map ---
      let boostedMap: Record<string, any> = {};
      try {
        const adsRes = await fetch(
          `${BASE}/${adsCfg.adAccountId}/ads?fields=id,name,status,creative{body,object_story_spec}&limit=200&access_token=${cfg.token}`
        );
        const adsData = await adsRes.json();
        const ads = adsData.data || [];

        await Promise.all(
          ads.map(async (ad: any) => {
            try {
              const body =
                ad.creative?.body ||
                ad.creative?.object_story_spec?.link_data?.message ||
                ad.creative?.object_story_spec?.photo_data?.caption ||
                ad.creative?.object_story_spec?.video_data?.message || "";
              if (!body) return;

              let insRes = await fetch(
                `${BASE}/${ad.id}/insights?fields=spend,reach,impressions,clicks,cpm,ctr,actions,account_currency&time_range={"since":"${from}","until":"${to}"}&access_token=${cfg.token}`
              );
              let insData = await insRes.json();
              let ins = insData.data?.[0] || {};

              if (!ins.spend || parseFloat(ins.spend) === 0) {
                const fallbackRes = await fetch(
                  `${BASE}/${ad.id}/insights?fields=spend,reach,impressions,clicks,cpm,ctr,actions,account_currency&date_preset=maximum&access_token=${cfg.token}`
                );
                const fallbackData = await fallbackRes.json();
                ins = fallbackData.data?.[0] || ins;
              }

              const getAction = (type: string) => {
                const action = ins.actions?.find((a: any) => a.action_type === type);
                return parseInt(action?.value || "0");
              };

              const key = body.trim().substring(0, 100).toLowerCase();
              const entry = {
                adName: ad.name,
                status: ad.status,
                amountSpent: ins.spend || "0",
                paidReach: parseInt(ins.reach || "0"),
                paidLikes: getAction("onsite_conversion.post_net_like"),
                paidComments: getAction("onsite_conversion.post_net_comment"),
                paidShares: getAction("post"),
                impressions: parseInt(ins.impressions || "0"),
                clicks: parseInt(ins.clicks || "0"),
                cpm: parseFloat(ins.cpm || "0").toFixed(2),
                ctr: parseFloat(ins.ctr || "0").toFixed(2),
                body: body.trim(),
              };

              const existing = boostedMap[key];
              if (!existing || parseFloat(entry.amountSpent) > parseFloat(existing.amountSpent)) {
                boostedMap[key] = entry;
              }
            } catch {}
          })
        );
      } catch {}

      const matchBoosted = (message: string) => {
        const key = message.trim().substring(0, 100).toLowerCase();
        return (
          boostedMap[key] ||
          Object.values(boostedMap).find(
            (b: any) =>
              b.body.trim().substring(0, 100).toLowerCase() === key ||
              message.trim().startsWith(b.body.trim().substring(0, 80)) ||
              b.body.trim().startsWith(message.trim().substring(0, 80))
          ) ||
          null
        );
      };

      // --- Fetch Facebook posts ---
      let fbPosts: Post[] = [];
      const fbRes = await fetch(
        `${BASE}/${cfg.fbPageId}/posts?fields=id,message,created_time,permalink_url,full_picture,reactions.summary(total_count),comments.summary(total_count),shares&since=${from}&until=${to}&limit=100&access_token=${cfg.token}`
      );
      const fbData = await fbRes.json();
      const rawFB = fbData.data || [];

      fbPosts = await Promise.all(
        rawFB.map(async (post: any) => {
          const isReel = post.permalink_url?.includes("/reel/") || post.permalink_url?.includes("/videos/");
          const likes = post.reactions?.summary?.total_count ?? 0;
          const comments = post.comments?.summary?.total_count ?? 0;
          const shares = post.shares?.count ?? 0;
          let reach = 0;
          try {
            const insRes = await fetch(`${BASE}/${post.id}/insights?metric=post_impressions_unique&access_token=${cfg.token}`);
            const ins = await insRes.json();
            reach = ins?.data?.find((m: any) => m.name === "post_impressions_unique")?.values?.[0]?.value ?? 0;
          } catch {}

          const boosted = matchBoosted(post.message || "");
          return {
            id: post.id,
            message: post.message || "",
            createdTime: post.created_time,
            type: isReel ? "REEL" : "IMAGE",
            reach,
            likes,
            comments,
            shares,
            saves: 0,
            engagementRate: reach > 0 ? (((likes + comments + shares) / reach) * 100).toFixed(2) : "0.00",
            boosted: boosted
              ? {
                  adName: boosted.adName,
                  amountSpent: boosted.amountSpent,
                  paidReach: boosted.paidReach,
                  paidLikes: boosted.paidLikes,
                  paidComments: boosted.paidComments,
                  paidShares: boosted.paidShares,
                  impressions: boosted.impressions,
                  clicks: boosted.clicks,
                  cpm: boosted.cpm,
                  ctr: boosted.ctr,
                  status: boosted.status,
                }
              : null,
          };
        })
      );

      // --- Fetch Instagram posts ---
      let igPosts: Post[] = [];
      const igRes = await fetch(
        `${BASE}/${cfg.igUserId}/media?fields=id,caption,media_type,timestamp,permalink,media_url,thumbnail_url&since=${from}&until=${to}&limit=100&access_token=${cfg.token}`
      );
      const igData = await igRes.json();
      const rawIG = igData.data || [];

      igPosts = await Promise.all(
        rawIG.map(async (post: any) => {
          let reach = 0, likes = 0, comments = 0, shares = 0, saves = 0, avgWatchTime = null;
          try {
            const insRes = await fetch(`${BASE}/${post.id}/insights?metric=reach,likes,comments,shares,saved&period=lifetime&access_token=${cfg.token}`);
            const ins = await insRes.json();
            reach = igVal(ins?.data, "reach");
            likes = igVal(ins?.data, "likes");
            comments = igVal(ins?.data, "comments");
            shares = igVal(ins?.data, "shares");
            saves = igVal(ins?.data, "saved");
          } catch {}

          const mediaType = post.media_type === "VIDEO" ? "REEL" : post.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : "IMAGE";

          if (mediaType === "REEL") {
            try {
              const wRes = await fetch(`${BASE}/${post.id}/insights?metric=ig_reels_avg_watch_time&period=lifetime&access_token=${cfg.token}`);
              const wData = await wRes.json();
              const val = igVal(wData?.data, "ig_reels_avg_watch_time");
              if (val) avgWatchTime = Math.round(val / 1000);
            } catch {}
          }

          const boosted = matchBoosted(post.caption || "");
          return {
            id: post.id,
            message: post.caption || "",
            createdTime: post.timestamp,
            type: mediaType,
            reach,
            likes,
            comments,
            shares,
            saves,
            engagementRate: reach > 0 ? (((likes + comments + shares + saves) / reach) * 100).toFixed(2) : "0.00",
            avgWatchTime,
            boosted: boosted
              ? {
                  adName: boosted.adName,
                  amountSpent: boosted.amountSpent,
                  paidReach: boosted.paidReach,
                  paidLikes: boosted.paidLikes,
                  paidComments: boosted.paidComments,
                  paidShares: boosted.paidShares,
                  impressions: boosted.impressions,
                  clicks: boosted.clicks,
                  cpm: boosted.cpm,
                  ctr: boosted.ctr,
                  status: boosted.status,
                }
              : null,
          };
        })
      );

      // --- Fetch audience metrics ---
      let fbFollows = { follows: 0, unfollows: 0 };
      let igFollows = { follows: 0, unfollows: 0 };
      let fbPageViews = 0;
      let igProfileViews = 0;

      try {
        const fwRes = await fetch(`${BASE}/${cfg.fbPageId}/insights?metric=page_daily_follows_unique,page_daily_unfollows_unique&period=day&since=${from}&until=${to}&access_token=${cfg.token}`);
        const fwData = await fwRes.json();
        const fw = fwData?.data?.find((m: any) => m.name === "page_daily_follows_unique");
        const uf = fwData?.data?.find((m: any) => m.name === "page_daily_unfollows_unique");
        fbFollows = {
          follows: fw?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0,
          unfollows: uf?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0,
        };
      } catch {}

      try {
        const pvRes = await fetch(`${BASE}/${cfg.fbPageId}/insights?metric=page_views_total&period=day&since=${from}&until=${to}&access_token=${cfg.token}`);
        const pvData = await pvRes.json();
        const metric = pvData?.data?.find((m: any) => m.name === "page_views_total");
        fbPageViews = metric?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0;
      } catch {}

      try {
        const igfRes = await fetch(`${BASE}/${cfg.igUserId}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=${from}&until=${to}&access_token=${cfg.token}`);
        const igfData = await igfRes.json();
        const breakdown = igfData?.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
        igFollows = {
          follows: breakdown.find((b: any) => b.dimension_values?.[0] === "FOLLOWER")?.value || 0,
          unfollows: breakdown.find((b: any) => b.dimension_values?.[0] === "NON_FOLLOWER")?.value || 0,
        };
      } catch {}

      try {
        const ipvRes = await fetch(`${BASE}/${cfg.igUserId}/insights?metric=profile_views&metric_type=total_value&period=day&since=${from}&until=${to}&access_token=${cfg.token}`);
        const ipvData = await ipvRes.json();
        igProfileViews = ipvData?.data?.[0]?.total_value?.value || 0;
      } catch {}

      // --- Build summary ---
      const data: ReportData = {
        client,
        from,
        to,
        fbPosts,
        igPosts,
        summary: {
          facebook: {
            organicLikes: fbPosts.reduce((s, p) => s + p.likes, 0),
            organicComments: fbPosts.reduce((s, p) => s + p.comments, 0),
            organicShares: fbPosts.reduce((s, p) => s + p.shares, 0),
            organicReach: fbPosts.reduce((s, p) => s + p.reach, 0),
            paidReach: fbPosts.reduce((s, p) => s + (p.boosted?.paidReach || 0), 0),
            totalPosts: fbPosts.length,
            follows: fbFollows.follows,
            unfollows: fbFollows.unfollows,
            netFollowers: fbFollows.follows - fbFollows.unfollows,
            pageViews: fbPageViews,
          },
          instagram: {
            organicLikes: igPosts.reduce((s, p) => s + p.likes, 0),
            organicComments: igPosts.reduce((s, p) => s + p.comments, 0),
            organicShares: igPosts.reduce((s, p) => s + p.shares, 0),
            organicSaves: igPosts.reduce((s, p) => s + p.saves, 0),
            organicReach: igPosts.reduce((s, p) => s + p.reach, 0),
            paidLikes: igPosts.reduce((s, p) => s + (p.boosted?.paidLikes || 0), 0),
            paidComments: igPosts.reduce((s, p) => s + (p.boosted?.paidComments || 0), 0),
            paidShares: igPosts.reduce((s, p) => s + (p.boosted?.paidShares || 0), 0),
            paidReach: igPosts.reduce((s, p) => s + (p.boosted?.paidReach || 0), 0),
            totalPosts: igPosts.length,
            follows: igFollows.follows,
            unfollows: igFollows.unfollows,
            netFollowers: igFollows.follows - igFollows.unfollows,
            profileViews: igProfileViews,
          },
        },
      };

      setReportData(data);
    } catch (e: any) {
      setFetchError(e.message || "Failed to load data for AI analysis.");
    } finally {
      setFetching(false);
    }
  };

  const sendMessage = async (text?: string) => {
    const userText = (text || input).trim();
    if (!userText || loading || streaming || !reportData) return;

    setInput("");
    const newMessages: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);
    setStreaming(false);

    // Cancel any in-progress request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          reportData,
          client,
          from,
          to,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error("Failed to get response");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let assistantText = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      setLoading(false);
      setStreaming(true);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantText += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantText };
          return updated;
        });
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  if (!isAdmin) return null;

  const isReady = !fetching && !!reportData && !fetchError;
  const noConfig = !client || !from || !to;

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`fixed bottom-6 right-6 z-50 w-13 h-13 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 ${
          open
            ? dark
              ? "bg-white/10 border border-white/20"
              : "bg-slate-200 border border-slate-300"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
        style={{ width: 52, height: 52 }}
        title="AI Analyst"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={dark ? "text-white/60" : "text-slate-600"}>
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <circle cx="9" cy="10" r="1" fill="white" stroke="none" />
            <circle cx="12" cy="10" r="1" fill="white" stroke="none" />
            <circle cx="15" cy="10" r="1" fill="white" stroke="none" />
          </svg>
        )}

        {/* Pulse ring when closed */}
        {!open && (
          <span className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-20 pointer-events-none" />
        )}
      </button>

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-[76px] right-6 z-50 flex flex-col transition-all duration-300 origin-bottom-right ${
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-90 pointer-events-none"
        }`}
        style={{ width: 380, height: 560 }}
      >
        <div
          className={`flex flex-col h-full rounded-2xl overflow-hidden shadow-2xl border ${
            dark
              ? "bg-[#0e0e1a] border-white/[0.08]"
              : "bg-white border-slate-200"
          }`}
        >
          {/* Header */}
          <div className={`flex items-center gap-3 px-4 py-3 border-b flex-shrink-0 ${dark ? "border-white/[0.06] bg-[#1a1a2e]" : "border-slate-100 bg-slate-50"}`}>
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold ${dark ? "text-white" : "text-slate-900"}`}>Bludash AI Analyst</p>
              <p className={`text-[10px] truncate ${dark ? "text-white/35" : "text-slate-400"}`}>
                {noConfig
                  ? "Select a client & date range first"
                  : fetching
                  ? "Loading data..."
                  : reportData
                  ? `${client} · ${from} → ${to}`
                  : fetchError
                  ? "Error loading data"
                  : "Ready"}
              </p>
            </div>
            {/* Status dot */}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              fetching ? "bg-yellow-400 animate-pulse" :
              reportData ? "bg-emerald-400" :
              fetchError ? "bg-red-400" :
              "bg-slate-300"
            }`} />
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ scrollbarWidth: "thin" }}>

            {/* No config state */}
            {noConfig && (
              <div className={`flex-1 flex flex-col items-center justify-center gap-3 text-center py-8`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${dark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={dark ? "text-white/30" : "text-slate-400"}>
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <p className={`text-[12px] ${dark ? "text-white/30" : "text-slate-400"}`}>Please select a client and date range in the report builder to start the AI analysis.</p>
              </div>
            )}

            {/* Fetching state */}
            {!noConfig && fetching && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <p className={`text-[12px] ${dark ? "text-white/40" : "text-slate-400"}`}>Loading analytics data...</p>
              </div>
            )}

            {/* Error state */}
            {!noConfig && !fetching && fetchError && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <p className="text-[12px] text-red-400 text-center">{fetchError}</p>
                <button
                  onClick={fetchData}
                  className="text-[11px] px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Welcome + suggestions */}
            {isReady && messages.length === 0 && (
              <div className="flex flex-col gap-3 py-2">
                <div className={`rounded-xl px-3 py-2.5 text-[12px] leading-relaxed ${dark ? "bg-white/[0.04] text-white/60" : "bg-slate-50 text-slate-600"}`}>
                  <span className={`font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>Hey! I've loaded {reportData!.fbPosts.length} FB posts and {reportData!.igPosts.length} IG posts.</span> Ask me anything about this period's performance.
                </div>
                <p className={`text-[10px] font-semibold tracking-widest uppercase px-1 ${dark ? "text-white/20" : "text-slate-400"}`}>Suggested</p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className={`text-left text-[12px] px-3 py-2 rounded-lg border transition-all duration-150 hover:scale-[1.01] ${
                        dark
                          ? "border-white/[0.07] bg-white/[0.03] text-white/50 hover:text-white/80 hover:border-white/15 hover:bg-white/[0.06]"
                          : "border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:border-blue-300 hover:bg-blue-50/50"
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actual messages */}
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.role === "user" ? (
                  <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-blue-600 text-white text-[12.5px] leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div className={`max-w-[95%] px-3 py-2.5 rounded-2xl rounded-tl-sm text-[12.5px] leading-relaxed ${dark ? "bg-white/[0.05] text-white/80" : "bg-slate-50 text-slate-800 border border-slate-100"}`}>
                    {msg.content === "" && streaming ? (
                      <div className="flex gap-1 py-1">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    ) : (
                      renderMarkdown(msg.content)
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading state (before stream starts) */}
            {loading && !streaming && (
              <div className={`flex items-start`}>
                <div className={`px-3 py-2.5 rounded-2xl rounded-tl-sm ${dark ? "bg-white/[0.05]" : "bg-slate-50 border border-slate-100"}`}>
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          {isReady && (
            <div className={`flex-shrink-0 px-3 py-3 border-t ${dark ? "border-white/[0.06] bg-[#0e0e1a]" : "border-slate-100 bg-white"}`}>
              <div className={`flex items-end gap-2 rounded-xl border px-3 py-2 transition-colors ${dark ? "border-white/[0.08] bg-white/[0.03] focus-within:border-blue-500/40" : "border-slate-200 bg-slate-50 focus-within:border-blue-400"}`}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your posts..."
                  rows={1}
                  disabled={loading || streaming}
                  className={`flex-1 resize-none bg-transparent text-[13px] outline-none leading-relaxed disabled:opacity-40 ${dark ? "text-white placeholder:text-white/20" : "text-slate-800 placeholder:text-slate-400"}`}
                  style={{ maxHeight: 120 }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading || streaming}
                  className="flex-shrink-0 w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
              <p className={`text-[9px] text-center mt-1.5 ${dark ? "text-white/15" : "text-slate-300"}`}>
                Gemini 2.5 Pro · Enter to send
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}