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

export function useBoostedPosts(client: string, from: string, to: string) {
  const [boostedMap, setBoostedMap] = useState<Record<string, BoostedPost>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchBoosted(); }, [client, from, to]);

  const fetchBoosted = async () => {
    setLoading(true);
    try {
      const cfgRes = await fetch(`/api/ads?client=${client}`);
      const cfg = await cfgRes.json();
      if (!cfg.token) { setLoading(false); return; }

      const adsRes = await fetch(
  `${BASE}/${cfg.adAccountId}/ads?fields=id,name,status,creative{body,object_story_spec}&limit=200&access_token=${cfg.token}`
);
      const adsData = await adsRes.json();
      const ads = adsData.data || [];
      if (ads.length === 0) { setLoading(false); return; }

      const map: Record<string, BoostedPost> = {};

      await Promise.all(ads.map(async (ad: any) => {
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

// If no data in range, fall back to all-time
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
console.log("AD:", ad.name, "| spend:", ins.spend, "| reach:", ins.reach, "| likes:", getAction("onsite_conversion.post_net_like"));
          const key = body.trim().substring(0, 100).toLowerCase();

          const newEntry = {
  adId: ad.id,
  adName: ad.name,
  postId: ad.id,
  status: ad.status,
  amountSpent: ins.spend || "0",
  reach: parseInt(ins.reach || "0"),
  impressions: parseInt(ins.impressions || "0"),
  clicks: parseInt(ins.clicks || "0"),
  currency: ins.account_currency || "INR",
  body: body.trim(),
  paidLikes: getAction("onsite_conversion.post_net_like"),
  paidComments: getAction("onsite_conversion.post_net_comment"),
  paidShares: getAction("post"),
  paidVideoViews: getAction("video_view"),
  cpm: parseFloat(ins.cpm || "0").toFixed(2),
  ctr: parseFloat(ins.ctr || "0").toFixed(2),
};

// Only overwrite if new entry has more spend/reach data
const existing = map[key];
if (!existing || parseFloat(newEntry.amountSpent) > parseFloat(existing.amountSpent)) {
  map[key] = newEntry;
}
        } catch { }
      }));
      console.log("BOOSTED MAP KEYS:", Object.keys(map).map(k => k.substring(0, 60)));
      setBoostedMap(map);
    } catch { }
    finally { setLoading(false); }
  };

  return { boostedMap, boostedLoading: loading };
}