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
  accountInsight: AdInsight | null;
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

function getSaneActionExact(
  actions: MetaAction[] | undefined,
  maxReasonable: number,
  ...types: string[]
): number {
  const value = getActionExact(actions, ...types);
  return maxReasonable > 0 && value > maxReasonable ? 0 : value;
}

function getActionMax(actions: MetaAction[] | undefined, ...types: string[]): number {
  if (!actions) return 0;
  return Math.max(...types.map((type) => getActionExact(actions, type)), 0);
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

// REPLACE the entire getLeadCount function with this:
function getLeadCount(actions: MetaAction[] | undefined): number {
  if (!actions) return 0;

  // "lead" is Meta's deduplicated top-level count — source of truth at account level
  const topLevelLead = getActionExact(actions, "lead");
  const leadGrouped = getActionExact(actions, "onsite_conversion.lead_grouped", "leadgen_grouped");
  const registrationLeads = getActionExact(actions, "offsite_complete_registration_add_meta_leads");

  const best = Math.max(topLevelLead, leadGrouped, registrationLeads);
  if (best > 0) return best;

  return sumActions(
    actions,
    "onsite_conversion.lead",
    "offsite_conversion.fb_pixel_lead",
    "onsite_conversion.messaging_lead",
    "omni_lead"
  );
}

function buildInsight(ins: MetaInsight | undefined): AdInsight {
  const spend = parseFloat(ins?.spend || "0");
  const impressions = parseInt(ins?.impressions || "0", 10);
  const clicks = parseInt(ins?.clicks || "0", 10);
  const reach = parseInt(ins?.reach || "0", 10);
  const leads = getLeadCount(ins?.actions);
  const landingPageViews = getActionExact(ins?.actions, "landing_page_view");
  const postEngagements = getActionExact(ins?.actions, "post_engagement");
  const maxActionCount = Math.max(impressions, reach);

  const likes = getSaneActionExact(
    ins?.actions,
    maxActionCount,
    "post_reaction"
  );

  const comments = getSaneActionExact(
    ins?.actions,
    maxActionCount,
    "onsite_conversion.post_net_comment",
    "comment",
    "post_comment"
  );

  const shares = getSaneActionExact(
    ins?.actions,
    maxActionCount,
    "post",
    "share",
    "post_share"
  );

  const videoViews = getActionExact(
    ins?.actions,
    "video_view",
    "video_play",
    "video_watched"
  );

  const purchaseValue = sumActions(
    ins?.action_values,
    "offsite_conversion.fb_pixel_purchase",
    "onsite_conversion.purchase",
    "purchase"
  );

  const cpm =
    ins?.cpm != null ? parseFloat(ins.cpm) : impressions > 0 ? (spend / impressions) * 1000 : 0;
  const ctr =
    ins?.ctr != null
      ? parseFloat(ins.ctr)
      : impressions > 0
        ? (clicks / impressions) * 100
        : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpl = leads > 0 ? spend / leads : 0;
  const roas = spend > 0 ? purchaseValue / spend : 0;

  return {
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
    currency: ins?.account_currency || "INR",
  };
}

function buildInsightsParams(
  fields: string,
  from: string,
  to: string,
  token: string,
  level: "account" | "ad"
) {
  return new URLSearchParams({
    fields,
    time_range: JSON.stringify({ since: from, until: to }),
    level,
    limit: level === "account" ? "1" : "500",
    use_account_attribution_setting: "true",
    access_token: token,
  });
}

function didAdRunInPeriod(ad: Ad) {
  return (
    ad.insights.impressions > 0 ||
    ad.insights.spend > 0 ||
    ad.insights.reach > 0 ||
    ad.insights.clicks > 0
  );
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
  const [accountInsight, setAccountInsight] = useState<AdInsight | null>(null);
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
      console.log("[bludash] querying date range:", { from, to });

      const rawCampaigns = await fetchAllPages<MetaCampaign>(
        `${BASE}/${cfg.adAccountId}/campaigns?fields=id,name,objective,status,effective_status&limit=200&access_token=${cfg.token}`
      );

      const rawAdSets = await fetchAllPages<MetaAdSet>(
        `${BASE}/${cfg.adAccountId}/adsets?fields=id,name,status,campaign_id,daily_budget,lifetime_budget,effective_status&limit=200&access_token=${cfg.token}`
      );

      const rawAds = await fetchAllPages<MetaAd>(
        `${BASE}/${cfg.adAccountId}/ads?fields=id,name,status,campaign_id,adset_id,creative{thumbnail_url,image_url,video_id},effective_status&limit=500&access_token=${cfg.token}`
      );

      const baseInsightFields =
        "spend,reach,impressions,clicks,actions,action_values,account_currency,cpm,ctr";
      const adInsightFields =
        `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${baseInsightFields}`;

      // REPLACE the account insight fetch block:
let accountInsightData: AdInsight | null = null;
try {
  const url = `${BASE}/${cfg.adAccountId}/insights?fields=spend,reach,impressions,clicks,actions,action_values,account_currency,cpm,ctr&time_range=${encodeURIComponent(JSON.stringify({ since: from, until: to }))}&level=account&use_account_attribution_setting=true&access_token=${cfg.token}`;
  const res = await fetch(url);
  const json = await res.json();
console.log("[bludash] account actions:", JSON.stringify(json.data?.[0]?.actions, null, 2));
  if (json.error) throw new Error(json.error.message);
  if (Array.isArray(json.data) && json.data[0]) {
    accountInsightData = buildInsight(json.data[0]);
    console.log("[bludash] account leads parsed:", accountInsightData.leads);
  } else {
    console.warn("[bludash] account insight returned empty data");
  }
} catch (e) {
  console.error("[bludash] account insight fetch failed:", e);
}


      const allInsights = await fetchAllPages<MetaInsight>(
        `${BASE}/${cfg.adAccountId}/insights?${buildInsightsParams(
          adInsightFields,
          from,
          to,
          cfg.token,
          "ad"
        ).toString()}`
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

        const insight = buildInsight(ins);

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
          insights: insight,
        };
      });

      const adsWithData = builtAds.filter(
        (ad) => didAdRunInPeriod(ad) || ad.insights.leads > 0
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
setAccountInsight(accountInsightData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch ads performance");
      setAds([]);
      setCampaigns([]);
      setAccountInsight(null);
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
    accountInsight,
    token,
    refetch: fetchPerformance,
  };
}
