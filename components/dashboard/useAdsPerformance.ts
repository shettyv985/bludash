import { useCallback, useEffect, useState } from "react";

const BASE = "https://graph.facebook.com/v25.0";

export interface AdInsight {
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  cpm: number;
  ctr: number;
  cpc: number;
  likes: number;
  comments: number;
  shares: number;
  videoViews: number;
  leads: number;
  cpl: number;
  roas: number;
  landingPageViews: number;
  postEngagements: number;
  currency: string;
}

export interface Ad {
  id: string;
  name: string;
  status: string;
  adSetId: string;
  adSetName: string;
  campaignId: string;
  campaignName: string;
  campaignObjective: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  thumbnail: string | null;
  videoId: string | null;
  isVideo: boolean;
  insights: AdInsight;
}

export interface AdSet {
  id: string;
  name: string;
  status: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  ads: Ad[];
}

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  adSets: AdSet[];
}

interface UseAdsPerformanceResult {
  loading: boolean;
  error: string;
  ads: Ad[];
  campaigns: Campaign[];
  token: string;
  refetch: () => Promise<void>;
}

type MetaAction = {
  action_type?: string;
  value?: string | number;
};

type MetaCreative = {
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string;
};

type MetaCampaign = {
  id: string;
  name: string;
  objective?: string;
  status?: string;
  effective_status?: string;
};

type MetaAdSet = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
  daily_budget?: string | number | null;
  lifetime_budget?: string | number | null;
};

type MetaAd = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
  adset_id?: string;
  creative?: MetaCreative;
};

type MetaInsight = {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  reach?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  account_currency?: string;
  cpm?: string;
  ctr?: string;
  inline_link_click_ctr?: string;
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

function getActionExact(actions: MetaAction[] | undefined, ...types: string[]): number {
  if (!actions) return 0;
  for (const type of types) {
    const found = actions.find((a) => a.action_type === type);
    if (found) return parseInt(String(found.value || "0"), 10);
  }
  return 0;
}

function sumActions(actions: MetaAction[] | undefined, ...types: string[]): number {
  if (!actions) return 0;
  let total = 0;
  for (const type of types) {
    const found = actions.find((a) => a.action_type === type);
    if (found) total += parseInt(String(found.value || "0"), 10);
  }
  return total;
}

function getLeadCount(actions: MetaAction[] | undefined): number {
  if (!actions) return 0;

  const aggregateLeadCount = getActionExact(actions, "lead");
  if (aggregateLeadCount > 0) {
    return aggregateLeadCount;
  }

  const omniLeadCount = getActionExact(actions, "omni_lead");
  if (omniLeadCount > 0) {
    return omniLeadCount;
  }

  let total = 0;
  const countedTypes = new Set<string>();

  for (const action of actions) {
    const actionType = String(action?.action_type || "").toLowerCase();
    if (!actionType.includes("lead") || countedTypes.has(actionType)) {
      continue;
    }

    countedTypes.add(actionType);
    total += parseInt(String(action.value || "0"), 10);
  }

  return total;
}

export function useAdsPerformance(
  client: string,
  from: string,
  to: string
): UseAdsPerformanceResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ads, setAds] = useState<Ad[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [token, setToken] = useState("");

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

  const fetchPerformance = useCallback(async () => {
    if (!client || !from || !to) return;

    setLoading(true);
    setError("");

    try {
      const cfgRes = await fetch(`/api/ads?client=${client}`);
      const cfg = await cfgRes.json();

      if (!cfg.token || !cfg.adAccountId) {
        throw new Error("Invalid client Meta Ads config");
      }

      setToken(cfg.token);

      const rawCampaigns = await fetchAllPages<MetaCampaign>(
        `${BASE}/${cfg.adAccountId}/campaigns?fields=id,name,objective,status,effective_status&limit=200&access_token=${cfg.token}`
      );

      const rawAdSets = await fetchAllPages<MetaAdSet>(
        `${BASE}/${cfg.adAccountId}/adsets?fields=id,name,status,campaign_id,daily_budget,lifetime_budget,effective_status&limit=200&access_token=${cfg.token}`
      );

      const rawAds = await fetchAllPages<MetaAd>(
        `${BASE}/${cfg.adAccountId}/ads?fields=id,name,status,campaign_id,adset_id,creative{thumbnail_url,image_url,video_id},effective_status&limit=500&access_token=${cfg.token}`
      );

      const insightsParams = new URLSearchParams({
        fields:
          "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,reach,impressions,clicks,inline_link_clicks,actions,action_values,account_currency,cpm,ctr,inline_link_click_ctr",
        time_range: JSON.stringify({ since: from, until: to }),
        level: "ad",
        limit: "500",
        access_token: cfg.token,
        use_account_attribution_setting: "true",
        action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
      });

      const allInsights = await fetchAllPages<MetaInsight>(
        `${BASE}/${cfg.adAccountId}/insights?${insightsParams.toString()}`
      );

      const periodInsights = allInsights.filter(
        (ins): ins is MetaInsight & { ad_id: string } => Boolean(ins.ad_id)
      );

      const campMap: Record<string, MetaCampaign> = {};
      for (const c of rawCampaigns) {
        campMap[c.id] = c;
      }

      const adSetMap: Record<string, MetaAdSet> = {};
      for (const s of rawAdSets) {
        adSetMap[s.id] = s;
      }

      const adMap: Record<string, MetaAd> = {};
      for (const ad of rawAds) {
        adMap[ad.id] = ad;
      }

      const builtAds: Ad[] = periodInsights.map((ins) => {
        const ad = adMap[ins.ad_id] || {};
        const campaignId = ad.campaign_id || ins.campaign_id || "";
        const adSetId = ad.adset_id || ins.adset_id || "";
        const camp = campMap[campaignId] || {};
        const adSet = adSetMap[adSetId] || {};
        const creative = ad.creative || {};

        const thumbnail = creative.thumbnail_url || creative.image_url || null;
        const videoId = creative.video_id || null;
        const isVideo = !!videoId;

        const spend = parseFloat(ins.spend || "0");
        const impressions = parseInt(ins.impressions || "0", 10);
        const clicks = parseInt(ins.inline_link_clicks || ins.clicks || "0", 10);
        const reach = parseInt(ins.reach || "0", 10);

        const likes = getActionExact(
          ins.actions,
          "onsite_conversion.post_net_like",
          "like",
          "post_reaction"
        );

        const comments = getActionExact(
          ins.actions,
          "onsite_conversion.post_net_comment",
          "comment",
          "post_comment"
        );

        const shares = getActionExact(ins.actions, "post", "share", "post_share");

        const videoViews = getActionExact(
          ins.actions,
          "video_view",
          "video_play",
          "video_watched"
        );

        const leads = getLeadCount(ins.actions);

        const landingPageViews = getActionExact(ins.actions, "landing_page_view");

        const postEngagements = getActionExact(ins.actions, "post_engagement");

        const cpm =
          ins.cpm != null ? parseFloat(ins.cpm) : impressions > 0 ? (spend / impressions) * 1000 : 0;
        const ctr =
          ins.inline_link_click_ctr != null
            ? parseFloat(ins.inline_link_click_ctr)
            : impressions > 0
              ? (clicks / impressions) * 100
              : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const cpl = leads > 0 ? spend / leads : 0;

        const purchaseValue = sumActions(
          ins.action_values,
          "offsite_conversion.fb_pixel_purchase",
          "onsite_conversion.purchase",
          "purchase"
        );
        const roas = spend > 0 ? purchaseValue / spend : 0;

        return {
          id: ins.ad_id,
          name: ad.name || ins.ad_name || "Unknown Ad",
          status: ad.effective_status || ad.status || "UNKNOWN",
          adSetId,
          adSetName: adSet.name || ins.adset_name || "Unknown Ad Set",
          campaignId,
          campaignName: camp.name || ins.campaign_name || "Unknown Campaign",
          campaignObjective: camp.objective || "",
          dailyBudget: adSet.daily_budget ? Number(adSet.daily_budget) / 100 : null,
          lifetimeBudget: adSet.lifetime_budget ? Number(adSet.lifetime_budget) / 100 : null,
          thumbnail,
          videoId,
          isVideo,
          insights: {
            spend,
            reach,
            impressions,
            clicks,
            cpm,
            ctr,
            cpc,
            likes,
            comments,
            shares,
            videoViews,
            leads,
            cpl,
            roas,
            landingPageViews,
            postEngagements,
            currency: ins.account_currency || "INR",
          },
        };
      });

      const adsWithData = builtAds.filter(
        (ad) =>
          ad.insights.impressions > 0 ||
          ad.insights.spend > 0 ||
          ad.insights.leads > 0 ||
          ad.insights.reach > 0 ||
          ad.insights.clicks > 0
      );

      const insightCampaignIds = new Set(adsWithData.map((ad) => ad.campaignId));
      const campaignSource: MetaCampaign[] = [
        ...rawCampaigns,
        ...adsWithData
          .filter((ad) => ad.campaignId && !campMap[ad.campaignId])
          .map((ad) => ({
            id: ad.campaignId,
            name: ad.campaignName,
            objective: ad.campaignObjective,
            status: "UNKNOWN",
          })),
      ].filter((campaign) => insightCampaignIds.has(campaign.id));

      const groupedCampaigns: Campaign[] = campaignSource
        .map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          objective: campaign.objective || "",
          status: campaign.effective_status || campaign.status || "UNKNOWN",
          adSets: [
            ...rawAdSets.filter((adSet) => adSet.campaign_id === campaign.id),
            ...adsWithData
              .filter((ad) => ad.campaignId === campaign.id && ad.adSetId && !adSetMap[ad.adSetId])
              .map((ad) => ({
                id: ad.adSetId,
                name: ad.adSetName,
                status: "UNKNOWN",
                effective_status: "UNKNOWN",
                campaign_id: campaign.id,
                daily_budget: null,
                lifetime_budget: null,
              })),
          ]
            .filter(
              (adSet, index, source) =>
                adSet.id && source.findIndex((item) => item.id === adSet.id) === index
            )
            .map((adSet) => ({
              id: adSet.id,
              name: adSet.name,
              status: adSet.effective_status || adSet.status || "UNKNOWN",
              dailyBudget: adSet.daily_budget ? Number(adSet.daily_budget) / 100 : null,
              lifetimeBudget: adSet.lifetime_budget
                ? Number(adSet.lifetime_budget) / 100
                : null,
              ads: adsWithData.filter((ad) => ad.adSetId === adSet.id),
            }))
            .filter((adSet) => adSet.ads.length > 0),
        }))
        .filter((campaign) => campaign.adSets.length > 0);

      setAds(adsWithData);
      setCampaigns(groupedCampaigns);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch ads performance");
      setAds([]);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [client, fetchAllPages, from, to]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchPerformance();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchPerformance]);

  return {
    loading,
    error,
    ads,
    campaigns,
    token,
    refetch: fetchPerformance,
  };
}
