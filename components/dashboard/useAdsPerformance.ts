import { useEffect, useState } from "react";

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

function getActionExact(actions: any[], ...types: string[]): number {
  if (!actions) return 0;
  for (const type of types) {
    const found = actions.find((a: any) => a.action_type === type);
    if (found) return parseInt(found.value || "0", 10);
  }
  return 0;
}

function sumActions(actions: any[], ...types: string[]): number {
  if (!actions) return 0;
  let total = 0;
  for (const type of types) {
    const found = actions.find((a: any) => a.action_type === type);
    if (found) total += parseInt(found.value || "0", 10);
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

  useEffect(() => {
    fetchPerformance();
  }, [client, from, to]);

  const fetchAllPages = async (initialUrl: string, maxItems = 10000) => {
    const items: any[] = [];
    let nextUrl: string | null = initialUrl;

    while (nextUrl && items.length < maxItems) {
      const res = await fetch(nextUrl);
      const data = await res.json();

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

  const fetchPerformance = async () => {
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

      const rawCampaigns = await fetchAllPages(
        `${BASE}/${cfg.adAccountId}/campaigns?fields=id,name,objective,status,effective_status&limit=200&access_token=${cfg.token}`
      );

      const rawAdSets = await fetchAllPages(
        `${BASE}/${cfg.adAccountId}/adsets?fields=id,name,status,campaign_id,daily_budget,lifetime_budget,effective_status&limit=200&access_token=${cfg.token}`
      );

      const rawAds = await fetchAllPages(
        `${BASE}/${cfg.adAccountId}/ads?fields=id,name,status,campaign_id,adset_id,creative{thumbnail_url,image_url,video_id},effective_status&limit=50&access_token=${cfg.token}`
      );

      const insightsParams = new URLSearchParams({
        fields:
          "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,reach,impressions,clicks,actions,action_values,account_currency,cpm,ctr",
        time_range: JSON.stringify({ since: from, until: to }),
        level: "ad",
        limit: "500",
        access_token: cfg.token,
        use_account_attribution_setting: "true",
        action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
      });

      const allInsights = await fetchAllPages(
        `${BASE}/${cfg.adAccountId}/insights?${insightsParams.toString()}`
      );

      const insMap: Record<string, any> = {};
      for (const ins of allInsights) {
        insMap[ins.ad_id] = ins;
      }

      const campMap: Record<string, any> = {};
      for (const c of rawCampaigns) campMap[c.id] = c;

      const adSetMap: Record<string, any> = {};
      for (const s of rawAdSets) adSetMap[s.id] = s;

      const builtAds: Ad[] = rawAds.map((ad: any) => {
        const ins = insMap[ad.id] || {};
        const camp = campMap[ad.campaign_id] || {};
        const adSet = adSetMap[ad.adset_id] || {};
        const creative = ad.creative || {};

        const thumbnail = creative.thumbnail_url || creative.image_url || null;
        const videoId = creative.video_id || null;
        const isVideo = !!videoId;

        const spend = parseFloat(ins.spend || "0");
        const impressions = parseInt(ins.impressions || "0", 10);
        const clicks = parseInt(ins.clicks || "0", 10);
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

        const leads = getActionExact(ins.actions, "lead");

        const landingPageViews = getActionExact(ins.actions, "landing_page_view");

        const postEngagements = getActionExact(ins.actions, "post_engagement");

        const cpm =
          ins.cpm != null ? parseFloat(ins.cpm) : impressions > 0 ? (spend / impressions) * 1000 : 0;
        const ctr =
          ins.ctr != null ? parseFloat(ins.ctr) : impressions > 0 ? (clicks / impressions) * 100 : 0;
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
          id: ad.id,
          name: ad.name,
          status: ad.effective_status || ad.status,
          adSetId: ad.adset_id,
          adSetName: adSet.name || ins.adset_name || "Unknown Ad Set",
          campaignId: ad.campaign_id,
          campaignName: camp.name || ins.campaign_name || "Unknown Campaign",
          campaignObjective: camp.objective || "",
          dailyBudget: adSet.daily_budget ? parseInt(adSet.daily_budget, 10) / 100 : null,
          lifetimeBudget: adSet.lifetime_budget ? parseInt(adSet.lifetime_budget, 10) / 100 : null,
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
        (ad) => ad.insights.impressions > 0 || ad.insights.spend > 0
      );

      const groupedCampaigns: Campaign[] = rawCampaigns
        .map((campaign: any) => ({
          id: campaign.id,
          name: campaign.name,
          objective: campaign.objective || "",
          status: campaign.effective_status || campaign.status,
          adSets: rawAdSets
            .filter((adSet: any) => adSet.campaign_id === campaign.id)
            .map((adSet: any) => ({
              id: adSet.id,
              name: adSet.name,
              status: adSet.effective_status || adSet.status,
              dailyBudget: adSet.daily_budget ? parseInt(adSet.daily_budget, 10) / 100 : null,
              lifetimeBudget: adSet.lifetime_budget
                ? parseInt(adSet.lifetime_budget, 10) / 100
                : null,
              ads: adsWithData.filter((ad) => ad.adSetId === adSet.id),
            }))
            .filter((adSet: AdSet) => adSet.ads.length > 0),
        }))
        .filter((campaign: Campaign) => campaign.adSets.length > 0);

      setAds(adsWithData);
      setCampaigns(groupedCampaigns);
    } catch (err: any) {
      setError(err.message || "Failed to fetch ads performance");
      setAds([]);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    ads,
    campaigns,
    token,
    refetch: fetchPerformance,
  };
}
