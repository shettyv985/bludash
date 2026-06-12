import { useCallback, useEffect, useState } from "react";
import {
  captionLookupKeys,
  normalizedIdKeys,
  type BoostPlatform,
} from "@/lib/boostedPostMatch";

export interface BoostedPost {
  adId: string;
  adName: string;
  postId: string;
  platform: BoostPlatform;
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

type BoostedPostsCacheEntry = {
  expiresAt: number;
  value: Record<string, BoostedPost>;
};

const BASE = "https://graph.facebook.com/v25.0";
const BOOSTED_POSTS_CACHE_TTL_MS = 5 * 60 * 1000;
const AD_INSIGHT_FIELDS =
  "ad_id,ad_name,spend,reach,impressions,clicks,cpm,ctr,actions,account_currency";

const boostedPostsCache = new Map<string, BoostedPostsCacheEntry>();
const boostedPostsInFlight = new Map<string, Promise<Record<string, BoostedPost>>>();

function getCachedBoostedPosts(key: string) {
  const cached = boostedPostsCache.get(key);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    boostedPostsCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCachedBoostedPosts(key: string, value: Record<string, BoostedPost>) {
  boostedPostsCache.set(key, {
    expiresAt: Date.now() + BOOSTED_POSTS_CACHE_TTL_MS,
    value,
  });
}

type MetaAction = {
  action_type?: string;
  value?: string | number;
};

type AdInsight = {
  ad_id?: string;
  ad_name?: string;
  publisher_platform?: string;
  spend?: string;
  reach?: string;
  impressions?: string;
  clicks?: string;
  cpm?: string;
  ctr?: string;
  actions?: MetaAction[];
  account_currency?: string;
};

type MetaListResponse<T> = {
  data?: T[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
  };
};

type MetaStoryResponse = {
  caption?: string;
  message?: string;
  story?: string;
  description?: string;
};

type BoostedAdCreative = {
  body?: string;
  object_story_id?: string;
  effective_object_story_id?: string;
  effective_instagram_story_id?: string;
  source_instagram_media_id?: string;
  instagram_permalink_url?: string;
  object_story_spec?: {
    page_id?: string;
    instagram_actor_id?: string;
    instagram_user_id?: string;
    link_data?: {
      message?: string;
    };
    photo_data?: {
      caption?: string;
    };
    video_data?: {
      message?: string;
    };
  };
};

type BoostedAd = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  creative?: BoostedAdCreative;
};

type MetaErrorResponse = {
  error?: {
    message?: string;
  };
};

type AdsConfigResponse = {
  token?: string;
  adAccountId?: string;
};

function getActionExact(actions: MetaAction[] | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  for (const type of types) {
    const found = actions.find((action) => action?.action_type === type);
    if (found) return parseInt(String(found.value || "0"), 10);
  }
  return 0;
}

function getSaneActionExact(
  actions: MetaAction[] | undefined,
  types: string[],
  maxReasonable: number
): number {
  const value = getActionExact(actions, types);
  return maxReasonable > 0 && value > maxReasonable ? 0 : value;
}

function setBoostedEntry(
  map: Record<string, BoostedPost>,
  key: string,
  entry: BoostedPost
) {
  const existing = map[key];
  if (!existing || parseFloat(entry.amountSpent) > parseFloat(existing.amountSpent)) {
    map[key] = entry;
  }
}

function inferPlatform(ad: BoostedAd, objectStoryId: string, instagramStoryId: string): BoostPlatform {
  const spec = ad.creative?.object_story_spec || {};
  const adName = String(ad.name || "").toLowerCase();

  if (
    instagramStoryId ||
    spec.instagram_actor_id ||
    spec.instagram_user_id ||
    ad.creative?.instagram_permalink_url ||
    adName.includes("instagram") ||
    adName.includes("insta") ||
    adName.includes("ig")
  ) {
    return "IG";
  }

  if (spec.page_id || adName.includes("facebook") || adName.includes("fb")) {
    return "FB";
  }

  return "UNKNOWN";
}

function insightPlatform(
  insight: AdInsight,
  ad: BoostedAd,
  objectStoryId: string,
  instagramStoryId: string
): BoostPlatform {
  const publisher = String(insight.publisher_platform || "").toLowerCase();
  if (publisher === "instagram") return "IG";
  if (publisher === "facebook") return "FB";
  return inferPlatform(ad, objectStoryId, instagramStoryId);
}

async function fetchStoryCaption(
  storyId: string,
  platform: BoostPlatform,
  token: string
): Promise<string> {
  if (!storyId) return "";

  const fields =
    platform === "IG"
      ? "caption"
      : "message,story,description";

  try {
    const res = await fetch(
      `${BASE}/${storyId}?fields=${fields}&access_token=${token}`
    );
    const data = (await res.json()) as MetaStoryResponse;

    return (
      data?.caption ||
      data?.message ||
      data?.story ||
      data?.description ||
      ""
    );
  } catch {
    return "";
  }
}

async function fetchAdCreative(adId: string, token: string): Promise<BoostedAd> {
  const res = await fetch(
    `${BASE}/${adId}?fields=id,name,status,effective_status,creative{body,object_story_id,effective_object_story_id,effective_instagram_story_id,source_instagram_media_id,instagram_permalink_url,object_story_spec{page_id,instagram_actor_id,instagram_user_id,link_data{message},photo_data{caption},video_data{message}}}&access_token=${token}`
  );
  const data = (await res.json()) as BoostedAd & MetaErrorResponse;
  if (data?.error) throw new Error(data.error.message || "Failed to fetch ad creative");
  return data;
}

export function useBoostedPosts(client: string, from: string, to: string) {
  const [boostedMap, setBoostedMap] = useState<Record<string, BoostedPost>>({});
  const [loading, setLoading] = useState(true);

  const fetchAllPages = useCallback(async <T,>(initialUrl: string, maxItems = 10000) => {
    const items: T[] = [];
    let nextUrl: string | null = initialUrl;

    while (nextUrl && items.length < maxItems) {
      const res: Response = await fetch(nextUrl);
      const data = (await res.json()) as MetaListResponse<T>;

      if (data.error) {
        throw new Error(data.error.message || "Meta API request failed");
      }

      if (Array.isArray(data.data)) {
        items.push(...data.data);
      }

      nextUrl = data.paging?.next || null;
    }

    return items;
  }, []);

  const loadBoostedPosts = useCallback(async (): Promise<Record<string, BoostedPost>> => {
      const cfgRes = await fetch(`/api/ads?client=${client}&optional=1`);
      const cfg = (await cfgRes.json()) as AdsConfigResponse;

      if (!cfg.token || !cfg.adAccountId) {
        return {};
      }

      const timeRange = encodeURIComponent(
        JSON.stringify({ since: from, until: to })
      );
      let insights: AdInsight[] = [];

      try {
        insights = await fetchAllPages<AdInsight>(
          `${BASE}/${cfg.adAccountId}/insights?level=ad&fields=${AD_INSIGHT_FIELDS}&breakdowns=publisher_platform&time_range=${timeRange}&limit=500&access_token=${cfg.token}`
        );
      } catch {
        insights = await fetchAllPages<AdInsight>(
          `${BASE}/${cfg.adAccountId}/insights?level=ad&fields=${AD_INSIGHT_FIELDS}&time_range=${timeRange}&limit=500&access_token=${cfg.token}`
        );
      }

      const paidInsights = insights.filter((ins) => {
        const spend = parseFloat(ins.spend || "0");
        const reach = parseInt(ins.reach || "0", 10);
        const impressions = parseInt(ins.impressions || "0", 10);
        const clicks = parseInt(ins.clicks || "0", 10);
        return !!ins.ad_id && (spend > 0 || reach > 0 || impressions > 0 || clicks > 0);
      });

      if (paidInsights.length === 0) {
        return {};
      }

      const map: Record<string, BoostedPost> = {};
      const paidAdIds = new Set(
        paidInsights.map((ins) => ins.ad_id).filter((id): id is string => Boolean(id))
      );
      const adsById: Record<string, BoostedAd> = {};

      try {
        const rawAds = await fetchAllPages<BoostedAd>(
          `${BASE}/${cfg.adAccountId}/ads?fields=id,name,status,effective_status,creative{body,object_story_id,effective_object_story_id,effective_instagram_story_id,source_instagram_media_id,instagram_permalink_url,object_story_spec{page_id,instagram_actor_id,instagram_user_id,link_data{message},photo_data{caption},video_data{message}}}&limit=500&access_token=${cfg.token}`
        );

        for (const ad of rawAds) {
          if (ad?.id && paidAdIds.has(ad.id)) {
            adsById[ad.id] = ad;
          }
        }
      } catch {
        // Fall back to per-ad lookups below only for ads missing from the account list.
      }

      for (const ins of paidInsights) {
        try {
          const ad = adsById[ins.ad_id!] || await fetchAdCreative(ins.ad_id!, cfg.token);

          const objectStoryId =
            ad.creative?.object_story_id ||
            ad.creative?.effective_object_story_id ||
            "";
          const instagramStoryId =
            ad.creative?.effective_instagram_story_id || "";
          const sourceInstagramMediaId =
            ad.creative?.source_instagram_media_id || "";

          const platform = insightPlatform(ins, ad, objectStoryId, instagramStoryId);

          const creativeCaption =
            ad.creative?.body ||
            ad.creative?.object_story_spec?.link_data?.message ||
            ad.creative?.object_story_spec?.photo_data?.caption ||
            ad.creative?.object_story_spec?.video_data?.message ||
            "";

          const storyCaption = creativeCaption
            ? ""
            : await fetchStoryCaption(
              instagramStoryId || sourceInstagramMediaId || objectStoryId,
              platform,
              cfg.token
            );

          const body = creativeCaption || storyCaption || "";

          const impressions = parseInt(ins.impressions || "0", 10);
          const reach = parseInt(ins.reach || "0", 10);
          const clicks = parseInt(ins.clicks || "0", 10);

          const maxActionCount = Math.max(impressions, reach);

          const newEntry: BoostedPost = {
            adId: ins.ad_id!,
            adName: ad.name || ins.ad_name || "",
            postId:
              platform === "IG"
                ? instagramStoryId || sourceInstagramMediaId || objectStoryId || ad.id
                : objectStoryId || instagramStoryId || sourceInstagramMediaId || ad.id,
            platform,
            status: ad.effective_status || ad.status || "UNKNOWN",
            amountSpent: ins.spend || "0",
            reach,
            impressions,
            clicks,
            currency: ins.account_currency || "INR",
            body: body.trim(),
            paidLikes: getSaneActionExact(ins.actions, ["post_reaction"], maxActionCount),
            paidComments: getSaneActionExact(ins.actions, [
              "onsite_conversion.post_net_comment",
              "comment",
              "post_comment",
            ], maxActionCount),
            paidShares: getSaneActionExact(ins.actions, [
              "onsite_conversion.post_share",
              "share",
              "post",
              "post_share",
            ], maxActionCount),
            paidVideoViews: getActionExact(ins.actions, ["video_view", "thruplay"]),
            cpm: parseFloat(ins.cpm || "0").toFixed(2),
            ctr: parseFloat(ins.ctr || "0").toFixed(2),
          };

          for (const id of [objectStoryId, instagramStoryId, sourceInstagramMediaId]) {
            for (const key of normalizedIdKeys(id)) {
              setBoostedEntry(map, `post:${platform}:${key}`, newEntry);
              setBoostedEntry(map, `post:${key}`, newEntry);
            }
          }

          for (const key of captionLookupKeys(platform, body)) {
            setBoostedEntry(map, key, newEntry);
          }
        } catch {
          // Ignore single-ad failures
        }
      }

      return map;
  }, [client, fetchAllPages, from, to]);

  const fetchBoosted = useCallback(async () => {
    if (!client || !from || !to) {
      setBoostedMap({});
      setLoading(false);
      return;
    }

    const cacheKey = `${client}|${from}|${to}`;
    const cached = getCachedBoostedPosts(cacheKey);
    if (cached) {
      setBoostedMap(cached);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let pending = boostedPostsInFlight.get(cacheKey);
      if (!pending) {
        pending = loadBoostedPosts()
          .then((map) => {
            setCachedBoostedPosts(cacheKey, map);
            return map;
          })
          .finally(() => {
            boostedPostsInFlight.delete(cacheKey);
          });
        boostedPostsInFlight.set(cacheKey, pending);
      }

      setBoostedMap(await pending);
    } catch {
      setBoostedMap({});
    } finally {
      setLoading(false);
    }
  }, [client, from, loadBoostedPosts, to]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchBoosted();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchBoosted]);

  return { boostedMap, boostedLoading: loading };
}
