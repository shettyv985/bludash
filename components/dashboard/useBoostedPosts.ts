import { useState, useEffect } from "react";

export interface BoostedPost {
  adId: string;
  adName: string;
  postId: string;
  status: string;
  amountSpent: string;
  reach: number;
  impressions: number;
  clicks: number;
  currency: string;
  body: string;
  paidLikes: number;
  paidComments: number;
  paidShares: number;
  paidVideoViews: number;
  cpm: string;
  ctr: string;
}

const BASE = "https://graph.facebook.com/v25.0";

function sumActions(actions: any[] | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((sum, action) => {
    if (!types.includes(action?.action_type)) return sum;
    return sum + parseInt(action?.value || "0", 10);
  }, 0);
}

export function useBoostedPosts(client: string, from: string, to: string) {
  const [boostedMap, setBoostedMap] = useState<Record<string, BoostedPost>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBoosted();
  }, [client, from, to]);

  const fetchAllPages = async (initialUrl: string, maxItems = 10000) => {
    const items: any[] = [];
    let nextUrl: string | null = initialUrl;

    while (nextUrl && items.length < maxItems) {
      const res: Response = await fetch(nextUrl);
      const data: any = await res.json();

      if (data.error) {
        throw new Error(data.error.message || "Meta API request failed");
      }

      if (Array.isArray(data.data)) {
        items.push(...data.data);
      }

      nextUrl = data.paging?.next || null;
    }

    return items;
  };

  const fetchBoosted = async () => {
    if (!client || !from || !to) {
      setBoostedMap({});
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const cfgRes = await fetch(`/api/ads?client=${client}`);
      const cfg = await cfgRes.json();

      if (!cfg.token || !cfg.adAccountId) {
        setBoostedMap({});
        setLoading(false);
        return;
      }

      const ads = await fetchAllPages(
        `${BASE}/${cfg.adAccountId}/ads?fields=id,name,status,creative{body,object_story_spec}&limit=200&access_token=${cfg.token}`
      );

      if (ads.length === 0) {
        setBoostedMap({});
        setLoading(false);
        return;
      }

      const map: Record<string, BoostedPost> = {};

      await Promise.all(
        ads.map(async (ad: any) => {
          try {
            // ── Old behavior: pull caption from creative body / object_story_spec ──
            const body =
              ad.creative?.body ||
              ad.creative?.object_story_spec?.link_data?.message ||
              ad.creative?.object_story_spec?.photo_data?.caption ||
              ad.creative?.object_story_spec?.video_data?.message ||
              "";

            if (!body) return;

            // ── Step 1: try the requested date range first ────────────
            let insRes = await fetch(
              `${BASE}/${ad.id}/insights?fields=spend,reach,impressions,clicks,cpm,ctr,actions,account_currency&time_range={"since":"${from}","until":"${to}"}&access_token=${cfg.token}`
            );
            let insData = await insRes.json();
            let ins = insData.data?.[0] || {};

            // ── Step 2: if no data in range, fall back to all-time ────
            if (!ins.spend || parseFloat(ins.spend) === 0) {
              const fallbackRes = await fetch(
                `${BASE}/${ad.id}/insights?fields=spend,reach,impressions,clicks,cpm,ctr,actions,account_currency&date_preset=maximum&access_token=${cfg.token}`
              );
              const fallbackData = await fallbackRes.json();
              ins = fallbackData.data?.[0] || ins;
            }

            // ── Old-style key: first 100 chars of body, lowercased ────
            const key = body.trim().substring(0, 100).toLowerCase();

            const newEntry: BoostedPost = {
              adId: ad.id,
              adName: ad.name,
              postId: ad.id,
              status: ad.status,
              amountSpent: ins.spend || "0",
              reach: parseInt(ins.reach || "0", 10),
              impressions: parseInt(ins.impressions || "0", 10),
              clicks: parseInt(ins.clicks || "0", 10),
              currency: ins.account_currency || "INR",
              body: body.trim(),
              paidLikes: sumActions(ins.actions, [
                "onsite_conversion.post_net_like",
                "post_reaction",
                "like",
              ]),
              paidComments: sumActions(ins.actions, [
                "onsite_conversion.post_net_comment",
                "comment",
              ]),
              paidShares: sumActions(ins.actions, [
                "onsite_conversion.post_share",
                "share",
                "post",
              ]),
              paidVideoViews: sumActions(ins.actions, ["video_view", "thruplay"]),
              cpm: parseFloat(ins.cpm || "0").toFixed(2),
              ctr: parseFloat(ins.ctr || "0").toFixed(2),
            };

            // ── Old-behavior: highest-spend wins ─────────────────────
            const existing = map[key];
            if (
              !existing ||
              parseFloat(newEntry.amountSpent) > parseFloat(existing.amountSpent)
            ) {
              map[key] = newEntry;
            }
          } catch {
            // Ignore single-ad failures
          }
        })
      );

      setBoostedMap(map);
    } catch {
      setBoostedMap({});
    } finally {
      setLoading(false);
    }
  };

  return { boostedMap, boostedLoading: loading };
}