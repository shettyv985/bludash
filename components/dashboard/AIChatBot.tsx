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

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      elements.push(<p key={i} className="font-bold text-[13px] mt-3 mb-1">{renderInline(line.slice(4))}</p>);
    } else if (line.startsWith("## ")) {
      elements.push(<p key={i} className="font-bold text-[14px] mt-3 mb-1">{renderInline(line.slice(3))}</p>);
    } else if (line.startsWith("# ")) {
      elements.push(<p key={i} className="font-bold text-[15px] mt-3 mb-1">{renderInline(line.slice(2))}</p>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-2 my-0.5">
          <span className="opacity-50 mt-0.5 flex-shrink-0">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1];
      elements.push(
        <div key={i} className="flex gap-2 my-0.5">
          <span className="opacity-50 flex-shrink-0 w-4 text-right">{num}.</span>
          <span>{renderInline(line.replace(/^\d+\.\s/, ""))}</span>
        </div>
      );
    } else if (line.startsWith("---") || line.startsWith("***")) {
      elements.push(<hr key={i} className="my-2 border-current opacity-10" />);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(<p key={i} className="my-0.5 leading-relaxed">{renderInline(line)}</p>);
    }
    i++;
  }
  return elements;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const raw = match[0];
    if (raw.startsWith("**")) {
      parts.push(<strong key={match.index}>{raw.slice(2, -2)}</strong>);
    } else if (raw.startsWith("*")) {
      parts.push(<em key={match.index}>{raw.slice(1, -1)}</em>);
    } else if (raw.startsWith("`")) {
      parts.push(<code key={match.index} className="px-1 py-0.5 rounded text-[11px] bg-black/10 font-mono">{raw.slice(1, -1)}</code>);
    }
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const SUGGESTED_QUESTIONS = [
  "Which post had the best engagement rate?",
  "What's the worst performing creative and why?",
  "How did boosted posts perform vs organic?",
  "Which reel had the highest avg watch time?",
  "Give me a summary of this period's performance",
];

const MIN_W = 300;
const MIN_H = 380;
const MAX_W = 760;
const MAX_H = 900;
const DEFAULT_W = 380;
const DEFAULT_H = 560;

export default function AIChatBot({ client, from, to, dark, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [streaming, setStreaming] = useState(false);

  // Panel size & free position (null = CSS-anchored bottom-right)
  const [panelW, setPanelW] = useState(DEFAULT_W);
  const [panelH, setPanelH] = useState(DEFAULT_H);
  const [freePos, setFreePos] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Pointer state refs (avoids stale closure issues)
  const dragRef = useRef({ active: false, startPx: 0, startPy: 0, startEx: 0, startEy: 0 });
  const resizeRef = useRef({ active: false, edge: "", startPx: 0, startPy: 0, startW: 0, startH: 0, startEx: 0, startEy: 0 });

  // ── Mobile detection ───────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Clamp helper ──────────────────────────────────────────────────────────
  const clamp = useCallback((x: number, y: number, w: number, h: number) => ({
    x: Math.max(0, Math.min(x, window.innerWidth - w)),
    y: Math.max(0, Math.min(y, window.innerHeight - h)),
  }), []);

  // Clamp on viewport resize
  useEffect(() => {
    const onResize = () => {
      if (freePos) setFreePos((p) => p ? clamp(p.x, p.y, panelW, panelH) : p);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [freePos, panelW, panelH, clamp]);

  // ── Global pointer move / up ───────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      const cx = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const cy = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

      if (dragRef.current.active) {
        const dx = cx - dragRef.current.startPx;
        const dy = cy - dragRef.current.startPy;
        const nx = dragRef.current.startEx + dx;
        const ny = dragRef.current.startEy + dy;
        setFreePos(clamp(nx, ny, panelW, panelH));
        if ("preventDefault" in e) e.preventDefault();
      }

      if (resizeRef.current.active) {
        const { edge, startPx, startPy, startW, startH, startEx, startEy } = resizeRef.current;
        const dx = cx - startPx;
        const dy = cy - startPy;
        let nw = startW, nh = startH, nx = startEx, ny = startEy;

        if (edge.includes("e")) nw = Math.max(MIN_W, Math.min(MAX_W, startW + dx));
        if (edge.includes("w")) { nw = Math.max(MIN_W, Math.min(MAX_W, startW - dx)); nx = startEx + (startW - nw); }
        if (edge.includes("s")) nh = Math.max(MIN_H, Math.min(MAX_H, startH + dy));
        if (edge.includes("n")) { nh = Math.max(MIN_H, Math.min(MAX_H, startH - dy)); ny = startEy + (startH - nh); }

        setPanelW(nw);
        setPanelH(nh);
        if (edge.includes("w") || edge.includes("n")) setFreePos(clamp(nx, ny, nw, nh));
        if ("preventDefault" in e) e.preventDefault();
      }
    };

    const onUp = () => {
      dragRef.current.active = false;
      resizeRef.current.active = false;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [panelW, panelH, clamp]);

  // ── Drag start ────────────────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isMobile) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
    const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
    // If no free position yet, initialise from current CSS-anchored position
    const ex = freePos ? freePos.x : rect.left;
    const ey = freePos ? freePos.y : rect.top;
    if (!freePos) setFreePos({ x: ex, y: ey });
    dragRef.current = { active: true, startPx: cx, startPy: cy, startEx: ex, startEy: ey };
    e.preventDefault();
  }, [isMobile, freePos]);

  // ── Resize start ──────────────────────────────────────────────────────────
  const onResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, edge: string) => {
    if (isMobile) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
    const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
    const ex = freePos ? freePos.x : rect.left;
    const ey = freePos ? freePos.y : rect.top;
    if (!freePos) setFreePos({ x: ex, y: ey });
    resizeRef.current = { active: true, edge, startPx: cx, startPy: cy, startW: rect.width, startH: rect.height, startEx: ex, startEy: ey };
    e.preventDefault();
    e.stopPropagation();
  }, [isMobile, freePos]);

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // ── Data fetch triggers ───────────────────────────────────────────────────
  useEffect(() => {
    if (open && (!reportData || reportData.client !== client || reportData.from !== from || reportData.to !== to)) {
      fetchData();
    }
  }, [open, client, from, to]);

  useEffect(() => {
    setReportData(null);
    setMessages([]);
    setFetchError("");
  }, [client, from, to]);

  // ── Fetch all data ────────────────────────────────────────────────────────
  const fetchData = async () => {
    if (!client || !from || !to) { setFetchError("Please select a client and date range first."); return; }
    setFetching(true); setFetchError("");
    try {
      const cfg = await (await fetch(`/api/social-media?client=${client}`)).json();
      if (!cfg.token) throw new Error("Invalid client config");
      const adsCfg = await (await fetch(`/api/ads?client=${client}`)).json();

      // Boosted map
      let boostedMap: Record<string, any> = {};
      try {
        const adsData = await (await fetch(`${BASE}/${adsCfg.adAccountId}/ads?fields=id,name,status,creative{body,object_story_spec}&limit=200&access_token=${cfg.token}`)).json();
        await Promise.all((adsData.data || []).map(async (ad: any) => {
          try {
            const body = ad.creative?.body || ad.creative?.object_story_spec?.link_data?.message || ad.creative?.object_story_spec?.photo_data?.caption || ad.creative?.object_story_spec?.video_data?.message || "";
            if (!body) return;
            let ins = (await (await fetch(`${BASE}/${ad.id}/insights?fields=spend,reach,impressions,clicks,cpm,ctr,actions,account_currency&time_range={"since":"${from}","until":"${to}"}&access_token=${cfg.token}`)).json()).data?.[0] || {};
            if (!ins.spend || parseFloat(ins.spend) === 0) ins = (await (await fetch(`${BASE}/${ad.id}/insights?fields=spend,reach,impressions,clicks,cpm,ctr,actions,account_currency&date_preset=maximum&access_token=${cfg.token}`)).json()).data?.[0] || ins;
            const ga = (t: string) => parseInt(ins.actions?.find((a: any) => a.action_type === t)?.value || "0");
            const key = body.trim().substring(0, 100).toLowerCase();
            const entry = { adName: ad.name, status: ad.status, amountSpent: ins.spend || "0", paidReach: parseInt(ins.reach || "0"), paidLikes: ga("onsite_conversion.post_net_like"), paidComments: ga("onsite_conversion.post_net_comment"), paidShares: ga("post"), impressions: parseInt(ins.impressions || "0"), clicks: parseInt(ins.clicks || "0"), cpm: parseFloat(ins.cpm || "0").toFixed(2), ctr: parseFloat(ins.ctr || "0").toFixed(2), body: body.trim() };
            if (!boostedMap[key] || parseFloat(entry.amountSpent) > parseFloat(boostedMap[key].amountSpent)) boostedMap[key] = entry;
          } catch {}
        }));
      } catch {}

      const mb = (msg: string) => {
        const k = msg.trim().substring(0, 100).toLowerCase();
        return boostedMap[k] || Object.values(boostedMap).find((b: any) => b.body.trim().substring(0, 100).toLowerCase() === k || msg.trim().startsWith(b.body.trim().substring(0, 80)) || b.body.trim().startsWith(msg.trim().substring(0, 80))) || null;
      };

      // FB posts
      const fbRaw = (await (await fetch(`${BASE}/${cfg.fbPageId}/posts?fields=id,message,created_time,permalink_url,reactions.summary(total_count),comments.summary(total_count),shares&since=${from}&until=${to}&limit=100&access_token=${cfg.token}`)).json()).data || [];
      const fbPosts: Post[] = await Promise.all(fbRaw.map(async (p: any) => {
        const isReel = p.permalink_url?.includes("/reel/") || p.permalink_url?.includes("/videos/");
        const likes = p.reactions?.summary?.total_count ?? 0, comments = p.comments?.summary?.total_count ?? 0, shares = p.shares?.count ?? 0;
        let reach = 0;
        try { reach = (await (await fetch(`${BASE}/${p.id}/insights?metric=post_impressions_unique&access_token=${cfg.token}`)).json())?.data?.find((m: any) => m.name === "post_impressions_unique")?.values?.[0]?.value ?? 0; } catch {}
        const b = mb(p.message || "");
        return { id: p.id, message: p.message || "", createdTime: p.created_time, type: isReel ? "REEL" : "IMAGE", reach, likes, comments, shares, saves: 0, engagementRate: reach > 0 ? (((likes + comments + shares) / reach) * 100).toFixed(2) : "0.00", boosted: b ? { adName: b.adName, amountSpent: b.amountSpent, paidReach: b.paidReach, paidLikes: b.paidLikes, paidComments: b.paidComments, paidShares: b.paidShares, impressions: b.impressions, clicks: b.clicks, cpm: b.cpm, ctr: b.ctr, status: b.status } : null };
      }));

      // IG posts
      const igRaw = (await (await fetch(`${BASE}/${cfg.igUserId}/media?fields=id,caption,media_type,timestamp,permalink&since=${from}&until=${to}&limit=100&access_token=${cfg.token}`)).json()).data || [];
      const igPosts: Post[] = await Promise.all(igRaw.map(async (p: any) => {
        let reach = 0, likes = 0, comments = 0, shares = 0, saves = 0, avgWatchTime = null;
        try { const ins = (await (await fetch(`${BASE}/${p.id}/insights?metric=reach,likes,comments,shares,saved&period=lifetime&access_token=${cfg.token}`)).json())?.data; reach = igVal(ins, "reach"); likes = igVal(ins, "likes"); comments = igVal(ins, "comments"); shares = igVal(ins, "shares"); saves = igVal(ins, "saved"); } catch {}
        const mt = p.media_type === "VIDEO" ? "REEL" : p.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : "IMAGE";
        if (mt === "REEL") { try { const v = igVal((await (await fetch(`${BASE}/${p.id}/insights?metric=ig_reels_avg_watch_time&period=lifetime&access_token=${cfg.token}`)).json())?.data, "ig_reels_avg_watch_time"); if (v) avgWatchTime = Math.round(v / 1000); } catch {} }
        const b = mb(p.caption || "");
        return { id: p.id, message: p.caption || "", createdTime: p.timestamp, type: mt, reach, likes, comments, shares, saves, engagementRate: reach > 0 ? (((likes + comments + shares + saves) / reach) * 100).toFixed(2) : "0.00", avgWatchTime, boosted: b ? { adName: b.adName, amountSpent: b.amountSpent, paidReach: b.paidReach, paidLikes: b.paidLikes, paidComments: b.paidComments, paidShares: b.paidShares, impressions: b.impressions, clicks: b.clicks, cpm: b.cpm, ctr: b.ctr, status: b.status } : null };
      }));

      // Audience
      let fbF = { follows: 0, unfollows: 0 }, igF = { follows: 0, unfollows: 0 }, fbPV = 0, igPV = 0;
      try { const d = (await (await fetch(`${BASE}/${cfg.fbPageId}/insights?metric=page_daily_follows_unique,page_daily_unfollows_unique&period=day&since=${from}&until=${to}&access_token=${cfg.token}`)).json())?.data; fbF = { follows: d?.find((m: any) => m.name === "page_daily_follows_unique")?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0, unfollows: d?.find((m: any) => m.name === "page_daily_unfollows_unique")?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0 }; } catch {}
      try { fbPV = (await (await fetch(`${BASE}/${cfg.fbPageId}/insights?metric=page_views_total&period=day&since=${from}&until=${to}&access_token=${cfg.token}`)).json())?.data?.find((m: any) => m.name === "page_views_total")?.values?.reduce((s: number, v: any) => s + (v.value || 0), 0) || 0; } catch {}
      try { const br = (await (await fetch(`${BASE}/${cfg.igUserId}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=${from}&until=${to}&access_token=${cfg.token}`)).json())?.data?.[0]?.total_value?.breakdowns?.[0]?.results || []; igF = { follows: br.find((b: any) => b.dimension_values?.[0] === "FOLLOWER")?.value || 0, unfollows: br.find((b: any) => b.dimension_values?.[0] === "NON_FOLLOWER")?.value || 0 }; } catch {}
      try { igPV = (await (await fetch(`${BASE}/${cfg.igUserId}/insights?metric=profile_views&metric_type=total_value&period=day&since=${from}&until=${to}&access_token=${cfg.token}`)).json())?.data?.[0]?.total_value?.value || 0; } catch {}

      setReportData({
        client, from, to, fbPosts, igPosts,
        summary: {
          facebook: { organicLikes: fbPosts.reduce((s, p) => s + p.likes, 0), organicComments: fbPosts.reduce((s, p) => s + p.comments, 0), organicShares: fbPosts.reduce((s, p) => s + p.shares, 0), organicReach: fbPosts.reduce((s, p) => s + p.reach, 0), paidReach: fbPosts.reduce((s, p) => s + (p.boosted?.paidReach || 0), 0), totalPosts: fbPosts.length, follows: fbF.follows, unfollows: fbF.unfollows, netFollowers: fbF.follows - fbF.unfollows, pageViews: fbPV },
          instagram: { organicLikes: igPosts.reduce((s, p) => s + p.likes, 0), organicComments: igPosts.reduce((s, p) => s + p.comments, 0), organicShares: igPosts.reduce((s, p) => s + p.shares, 0), organicSaves: igPosts.reduce((s, p) => s + p.saves, 0), organicReach: igPosts.reduce((s, p) => s + p.reach, 0), paidLikes: igPosts.reduce((s, p) => s + (p.boosted?.paidLikes || 0), 0), paidComments: igPosts.reduce((s, p) => s + (p.boosted?.paidComments || 0), 0), paidShares: igPosts.reduce((s, p) => s + (p.boosted?.paidShares || 0), 0), paidReach: igPosts.reduce((s, p) => s + (p.boosted?.paidReach || 0), 0), totalPosts: igPosts.length, follows: igF.follows, unfollows: igF.unfollows, netFollowers: igF.follows - igF.unfollows, profileViews: igPV },
        },
      });
    } catch (e: any) {
      setFetchError(e.message || "Failed to load data for AI analysis.");
    } finally {
      setFetching(false);
    }
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (text?: string) => {
    const userText = (text || input).trim();
    if (!userText || loading || streaming || !reportData) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    const newMessages: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true); setStreaming(false);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: newMessages, reportData, client, from, to }), signal: abortRef.current.signal });
      if (!res.ok) throw new Error("Failed to get response");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let txt = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      setLoading(false); setStreaming(true);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        txt += decoder.decode(value, { stream: true });
        setMessages((prev) => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: txt }; return u; });
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally { setLoading(false); setStreaming(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleToggle = () => setOpen((o) => !o);

  if (!isAdmin) return null;

  const isReady = !fetching && !!reportData && !fetchError;
  const noConfig = !client || !from || !to;

  // ── Panel style ───────────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = isMobile
    ? { position: "fixed", left: 0, right: 0, bottom: 0, width: "100%", height: "82svh", zIndex: 50 }
    : freePos
    ? { position: "fixed", left: freePos.x, top: freePos.y, width: panelW, height: panelH, zIndex: 50 }
    : { position: "fixed", right: 24, bottom: 76, width: panelW, height: panelH, zIndex: 50 };

  const rh = `absolute z-10 select-none touch-none`; // resize handle base

  return (
    <>
      <style>{`
        .aic-n  { cursor: n-resize; }
        .aic-s  { cursor: s-resize; }
        .aic-e  { cursor: e-resize; }
        .aic-w  { cursor: w-resize; }
        .aic-ne { cursor: ne-resize; }
        .aic-nw { cursor: nw-resize; }
        .aic-se { cursor: se-resize; }
        .aic-sw { cursor: sw-resize; }
        .aic-drag { cursor: grab; user-select: none; touch-action: none; }
        .aic-drag:active { cursor: grabbing; }
      `}</style>

      {/* ── Toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={handleToggle}
        style={{ width: 52, height: 52, position: "fixed", bottom: 24, right: 24, zIndex: 51 }}
        className={`rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 ${open ? dark ? "bg-white/10 border border-white/20" : "bg-slate-200 border border-slate-300" : "bg-blue-600 hover:bg-blue-700"}`}
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
        {!open && <span className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-20 pointer-events-none" />}
      </button>

      {/* ── Mobile backdrop ───────────────────────────────────────────────── */}
      {isMobile && open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          style={{ zIndex: 49 }}
          onClick={handleToggle}
        />
      )}

      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        style={{
          ...panelStyle,
          opacity: open ? 1 : 0,
          transform: open ? "scale(1) translateY(0)" : isMobile ? "translateY(100%)" : "scale(0.93)",
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.22s ease, transform 0.22s ease",
          transformOrigin: isMobile ? "bottom center" : freePos ? "center" : "bottom right",
          willChange: "transform, opacity",
        }}
      >
        {/* Resize handles — desktop only */}
        {!isMobile && (
          <>
            <div className={`${rh} aic-n top-0 left-3 right-3`} style={{ height: 6 }} onMouseDown={(e) => onResizeStart(e, "n")} onTouchStart={(e) => onResizeStart(e, "n")} />
            <div className={`${rh} aic-s bottom-0 left-3 right-3`} style={{ height: 6 }} onMouseDown={(e) => onResizeStart(e, "s")} onTouchStart={(e) => onResizeStart(e, "s")} />
            <div className={`${rh} aic-e right-0 top-3 bottom-3`} style={{ width: 6 }} onMouseDown={(e) => onResizeStart(e, "e")} onTouchStart={(e) => onResizeStart(e, "e")} />
            <div className={`${rh} aic-w left-0 top-3 bottom-3`} style={{ width: 6 }} onMouseDown={(e) => onResizeStart(e, "w")} onTouchStart={(e) => onResizeStart(e, "w")} />
            <div className={`${rh} aic-ne top-0 right-0`} style={{ width: 14, height: 14 }} onMouseDown={(e) => onResizeStart(e, "ne")} onTouchStart={(e) => onResizeStart(e, "ne")} />
            <div className={`${rh} aic-nw top-0 left-0`} style={{ width: 14, height: 14 }} onMouseDown={(e) => onResizeStart(e, "nw")} onTouchStart={(e) => onResizeStart(e, "nw")} />
            <div className={`${rh} aic-se bottom-0 right-0`} style={{ width: 14, height: 14 }} onMouseDown={(e) => onResizeStart(e, "se")} onTouchStart={(e) => onResizeStart(e, "se")} />
            <div className={`${rh} aic-sw bottom-0 left-0`} style={{ width: 14, height: 14 }} onMouseDown={(e) => onResizeStart(e, "sw")} onTouchStart={(e) => onResizeStart(e, "sw")} />
          </>
        )}

        {/* Inner panel */}
        <div className={`flex flex-col h-full overflow-hidden shadow-2xl border ${isMobile ? "rounded-t-[22px]" : "rounded-2xl"} ${dark ? "bg-[#0e0e1a] border-white/[0.08]" : "bg-white border-slate-200"}`}>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div
            className={`flex items-center gap-3 px-4 py-3 border-b flex-shrink-0 ${!isMobile ? "aic-drag" : ""} ${dark ? "border-white/[0.06] bg-[#1a1a2e]" : "border-slate-100 bg-slate-50"}`}
            onMouseDown={!isMobile ? onDragStart : undefined}
            onTouchStart={!isMobile ? onDragStart : undefined}
          >
            {/* Mobile swipe pill */}
            {isMobile && (
              <div className={`absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full ${dark ? "bg-white/15" : "bg-slate-300"}`} />
            )}

            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold leading-tight ${dark ? "text-white" : "text-slate-900"}`}>Bludash AI Analyst</p>
              <p className={`text-[10px] truncate leading-tight ${dark ? "text-white/35" : "text-slate-400"}`}>
                {noConfig ? "Select a client & date range first" : fetching ? "Loading data..." : reportData ? `${client} · ${from} → ${to}` : fetchError ? "Error loading data" : "Ready"}
              </p>
            </div>

            {/* Drag dots hint (desktop) */}
            {!isMobile && (
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="14" viewBox="0 0 10 14" className={`flex-shrink-0 ${dark ? "text-white/15" : "text-slate-300"}`}>
                {[0, 1].map((col) => [0, 1, 2].map((row) => <circle key={`${col}-${row}`} cx={col * 5 + 2} cy={row * 5 + 2} r="1.2" fill="currentColor" />))}
              </svg>
            )}

            {/* Status dot */}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${fetching ? "bg-yellow-400 animate-pulse" : reportData ? "bg-emerald-400" : fetchError ? "bg-red-400" : dark ? "bg-white/20" : "bg-slate-300"}`} />

            {/* Mobile close */}
            {isMobile && (
              <button onClick={handleToggle} className={`ml-1 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${dark ? "bg-white/[0.06] text-white/50" : "bg-slate-200 text-slate-500"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* ── Messages ─────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>

            {noConfig && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${dark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={dark ? "text-white/30" : "text-slate-400"}>
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <p className={`text-[12px] max-w-[200px] leading-relaxed ${dark ? "text-white/30" : "text-slate-400"}`}>Select a client and date range in the report builder first.</p>
              </div>
            )}

            {!noConfig && fetching && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <div className="flex gap-1.5">{[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                <p className={`text-[12px] ${dark ? "text-white/40" : "text-slate-400"}`}>Loading analytics data...</p>
              </div>
            )}

            {!noConfig && !fetching && fetchError && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <p className="text-[12px] text-red-400 text-center px-4">{fetchError}</p>
                <button onClick={fetchData} className="text-[11px] px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">Retry</button>
              </div>
            )}

            {isReady && messages.length === 0 && (
              <div className="flex flex-col gap-3 py-1">
                <div className={`rounded-xl px-3 py-2.5 text-[12px] leading-relaxed ${dark ? "bg-white/[0.04] text-white/60" : "bg-slate-50 text-slate-600"}`}>
                  <span className={`font-semibold ${dark ? "text-white/80" : "text-slate-800"}`}>Hey! Loaded {reportData!.fbPosts.length} FB + {reportData!.igPosts.length} IG posts.</span> Ask me anything about this period's performance.
                </div>
                <p className={`text-[10px] font-semibold tracking-widest uppercase px-1 ${dark ? "text-white/20" : "text-slate-400"}`}>Suggested</p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button key={q} onClick={() => sendMessage(q)}
                      className={`text-left text-[12px] px-3 py-2 rounded-lg border transition-all duration-150 active:scale-[0.99] ${dark ? "border-white/[0.07] bg-white/[0.03] text-white/50 hover:text-white/80 hover:border-white/15 hover:bg-white/[0.06]" : "border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:border-blue-300 hover:bg-blue-50/50"}`}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.role === "user" ? (
                  <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm bg-blue-600 text-white text-[12.5px] leading-relaxed">{msg.content}</div>
                ) : (
                  <div className={`max-w-[95%] px-3 py-2.5 rounded-2xl rounded-tl-sm text-[12.5px] leading-relaxed ${dark ? "bg-white/[0.05] text-white/80" : "bg-slate-50 text-slate-800 border border-slate-100"}`}>
                    {msg.content === "" && streaming
                      ? <div className="flex gap-1 py-1">{[0, 1, 2].map((i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                      : renderMarkdown(msg.content)}
                  </div>
                )}
              </div>
            ))}

            {loading && !streaming && (
              <div className="flex items-start">
                <div className={`px-3 py-2.5 rounded-2xl rounded-tl-sm ${dark ? "bg-white/[0.05]" : "bg-slate-50 border border-slate-100"}`}>
                  <div className="flex gap-1">{[0, 1, 2].map((i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input ─────────────────────────────────────────────────────── */}
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
              <p className={`text-[9px] text-center mt-1.5 ${dark ? "text-white/15" : "text-slate-300"}`}>Gemini 2.5 Pro · Enter to send</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}