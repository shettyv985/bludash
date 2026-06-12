import type {
  Ad,
  AdInsight,
  AdSet,
  Campaign,
} from "@/components/dashboard/useAdsPerformance";

const BASE = "https://graph.facebook.com/v25.0";

type MetaAction = {
  action_type?: string;
  value?: string | number;
};

type MetaCreative = {
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string;
  body?: string;
  object_story_spec?: {
    link_data?: { message?: string };
    photo_data?: { caption?: string };
    video_data?: { message?: string };
  };
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
  video_play_actions?: MetaAction[];
  video_avg_time_watched_actions?: MetaAction[];
  video_p25_watched_actions?: MetaAction[];
  video_p50_watched_actions?: MetaAction[];
  video_p75_watched_actions?: MetaAction[];
  video_p95_watched_actions?: MetaAction[];
  video_p100_watched_actions?: MetaAction[];
  video_thruplay_watched_actions?: MetaAction[];
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

type MetaErrorResponse = {
  error?: {
    message?: string;
  };
};

const INSIGHT_SUM_FIELDS = [
  "spend",
  "reach",
  "impressions",
  "clicks",
  "inline_link_clicks",
] as const;

const INSIGHT_ACTION_FIELDS = [
  "actions",
  "action_values",
  "video_play_actions",
  "video_avg_time_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p95_watched_actions",
  "video_p100_watched_actions",
  "video_thruplay_watched_actions",
] as const;

const INSIGHT_RATE_FIELDS = ["cpm", "ctr", "inline_link_click_ctr"] as const;

export type AdsCreativeAd = Ad & {
  creativeText?: string;
};

export type AdsPerformanceSnapshot = {
  ads: AdsCreativeAd[];
  campaigns: Campaign[];
  accountInsight: AdInsight | null;
};

type AdsConfig = {
  token: string;
  adAccountId: string;
};

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as T & MetaErrorResponse;

  if (data?.error) {
    throw new Error(data.error.message || "Meta API request failed");
  }

  if (!res.ok) {
    throw new Error(`Meta API request failed (${res.status})`);
  }

  return data as T;
}

async function fetchAllPages<T>(initialUrl: string, maxItems = 10000) {
  const items: T[] = [];
  let nextUrl: string | null = initialUrl;

  while (nextUrl && items.length < maxItems) {
    const data: MetaListResponse<T> = await fetchJSON<MetaListResponse<T>>(nextUrl);

    if (Array.isArray(data.data)) {
      items.push(...data.data);
    }

    nextUrl = data.paging?.next || null;
  }

  return items;
}

async function fetchNodesByIds<T extends { id: string }>(
  ids: string[],
  fields: string,
  token: string,
  chunkSize = 40
) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const items: T[] = [];

  async function fetchSingleNode(id: string) {
    const params = new URLSearchParams({
      fields,
      access_token: token,
    });
    const node = await fetchJSON<Partial<T> & MetaErrorResponse>(
      `${BASE}/${id}?${params.toString()}`
    );

    if (!node || node.error) return null;
    return { ...node, id: String(node.id || id) } as T;
  }

  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const chunk = uniqueIds.slice(index, index + chunkSize);
    const params = new URLSearchParams({
      ids: chunk.join(","),
      fields,
      access_token: token,
    });
    try {
      const data = await fetchJSON<
        Record<string, (Partial<T> & MetaErrorResponse) | null>
      >(`${BASE}/?${params.toString()}`);
      const chunkItems: T[] = [];

      for (const [id, node] of Object.entries(data)) {
        if (!node || node.error) continue;
        chunkItems.push({ ...node, id: String(node.id || id) } as T);
      }

      const missingIds = chunk.filter((id) => !chunkItems.some((node) => node.id === id));
      const thinIds = chunkItems
        .filter((node) => Object.keys(node).length <= 1)
        .map((node) => node.id);
      const retryIds = Array.from(new Set([...missingIds, ...thinIds]));

      if (retryIds.length > 0) {
        const retried = await Promise.all(
          retryIds.map(async (id) => {
            try {
              return await fetchSingleNode(id);
            } catch {
              return null;
            }
          })
        );
        const retriedById = new Map(
          retried.filter(Boolean).map((node) => [(node as T).id, node as T])
        );
        items.push(
          ...chunkItems.map((node) => retriedById.get(node.id) || node),
          ...retryIds
            .filter((id) => !chunkItems.some((node) => node.id === id))
            .map((id) => retriedById.get(id))
            .filter((node): node is T => Boolean(node))
        );
      } else {
        items.push(...chunkItems);
      }
    } catch {
      const settled = await Promise.all(
        chunk.map(async (id) => {
          try {
            return await fetchSingleNode(id);
          } catch {
            return null;
          }
        })
      );
      for (const node of settled) {
        if (node) items.push(node as T);
      }
    }
  }

  return items;
}

function getActionExact(actions: MetaAction[] | undefined, ...types: string[]): number {
  if (!actions) return 0;
  for (const type of types) {
    const found = actions.find((action) => action.action_type === type);
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

function getAnyActionValue(actions: MetaAction[] | undefined): number {
  if (!actions?.length) return 0;

  return Math.max(
    ...actions.map((action) => {
      const value = parseFloat(String(action.value || "0"));
      return Number.isFinite(value) ? value : 0;
    }),
    0
  );
}

function sumActions(actions: MetaAction[] | undefined, ...types: string[]): number {
  if (!actions) return 0;
  let total = 0;

  for (const type of types) {
    const found = actions.find((action) => action.action_type === type);
    if (found) total += parseInt(String(found.value || "0"), 10);
  }

  return total;
}

function getLeadCount(actions: MetaAction[] | undefined): number {
  if (!actions) return 0;

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

  const likes = getSaneActionExact(ins?.actions, maxActionCount, "post_reaction");
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

  const videoViews = Math.max(
    getActionExact(ins?.actions, "video_view", "video_play", "video_watched"),
    Math.round(getAnyActionValue(ins?.video_play_actions))
  );

  const videoP25 = Math.round(getAnyActionValue(ins?.video_p25_watched_actions));
  const videoP50 = Math.round(getAnyActionValue(ins?.video_p50_watched_actions));
  const videoP75 = Math.round(getAnyActionValue(ins?.video_p75_watched_actions));
  const videoP95 = Math.round(getAnyActionValue(ins?.video_p95_watched_actions));
  const videoP100 = Math.round(getAnyActionValue(ins?.video_p100_watched_actions));
  const thruPlays = Math.round(getAnyActionValue(ins?.video_thruplay_watched_actions));
  const rawAvgWatchTime = getAnyActionValue(ins?.video_avg_time_watched_actions);
  const normalizedAvgWatchTime = rawAvgWatchTime > 600 ? rawAvgWatchTime / 1000 : rawAvgWatchTime;
  const videoAvgWatchTime =
    normalizedAvgWatchTime > 0 ? parseFloat(normalizedAvgWatchTime.toFixed(1)) : null;
  const hookRate =
    impressions > 0 && videoViews > 0 ? parseFloat(((videoViews / impressions) * 100).toFixed(2)) : 0;
  const skipRate =
    impressions > 0 && videoViews > 0 ? parseFloat(Math.max(0, 100 - hookRate).toFixed(2)) : 0;
  const holdRate50 =
    videoViews > 0 && videoP50 > 0 ? parseFloat(((videoP50 / videoViews) * 100).toFixed(2)) : 0;
  const completionRate =
    videoViews > 0 && Math.max(videoP95, videoP100) > 0
      ? parseFloat(((Math.max(videoP95, videoP100) / videoViews) * 100).toFixed(2))
      : 0;
  const purchaseValue = sumActions(
    ins?.action_values,
    "offsite_conversion.fb_pixel_purchase",
    "onsite_conversion.purchase",
    "purchase"
  );

  const cpm = ins?.cpm != null ? parseFloat(ins.cpm) : impressions > 0 ? (spend / impressions) * 1000 : 0;
  const ctr =
    ins?.ctr != null ? parseFloat(ins.ctr) : impressions > 0 ? (clicks / impressions) * 100 : 0;
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
    hookRate,
    skipRate,
    videoAvgWatchTime,
    videoP25,
    videoP50,
    videoP75,
    videoP95,
    videoP100,
    thruPlays,
    holdRate50,
    completionRate,
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
    limit: level === "account" ? "1" : "100",
    use_account_attribution_setting: "true",
    access_token: token,
  });
}

function parseReportDate(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function formatReportDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDateChunks(from: string, to: string) {
  const start = parseReportDate(from);
  const end = parseReportDate(to);
  const chunkDays = Math.max(1, Number(process.env.CREATIVE_DIGEST_INSIGHTS_CHUNK_DAYS || "2") || 2);

  if (!start || !end || start > end) {
    return [{ from, to }];
  }

  const chunks: Array<{ from: string; to: string }> = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({
      from: formatReportDate(chunkStart),
      to: formatReportDate(chunkEnd),
    });

    cursor.setTime(chunkEnd.getTime());
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return chunks;
}

function parseMetric(value: unknown) {
  const metric = parseFloat(String(value || "0"));
  return Number.isFinite(metric) ? metric : 0;
}

function mergeActionTotals(
  current: MetaAction[] | undefined,
  next: MetaAction[] | undefined
): MetaAction[] | undefined {
  if (!current?.length && !next?.length) return undefined;

  const totals = new Map<string, number>();

  for (const action of [...(current || []), ...(next || [])]) {
    if (!action.action_type) continue;
    totals.set(action.action_type, (totals.get(action.action_type) || 0) + parseMetric(action.value));
  }

  return Array.from(totals.entries()).map(([action_type, value]) => ({
    action_type,
    value: Number(value.toFixed(4)).toString(),
  }));
}

function mergeInsight(current: MetaInsight | undefined, next: MetaInsight) {
  const merged: MetaInsight = current ? { ...current } : {};

  for (const field of [
    "ad_id",
    "ad_name",
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    "account_currency",
  ] as const) {
    if (!merged[field] && next[field]) merged[field] = next[field];
  }

  for (const field of INSIGHT_SUM_FIELDS) {
    const total = parseMetric(merged[field]) + parseMetric(next[field]);
    if (total > 0) merged[field] = Number(total.toFixed(4)).toString();
  }

  for (const field of INSIGHT_ACTION_FIELDS) {
    merged[field] = mergeActionTotals(merged[field], next[field]);
  }

  for (const field of INSIGHT_RATE_FIELDS) {
    delete merged[field];
  }

  return merged;
}

function mergeInsightsByAd(insights: MetaInsight[]) {
  const byAd = new Map<string, MetaInsight>();

  for (const insight of insights) {
    if (!insight.ad_id) continue;
    byAd.set(insight.ad_id, mergeInsight(byAd.get(insight.ad_id), insight));
  }

  return Array.from(byAd.values());
}

async function fetchAdInsights(
  config: AdsConfig,
  from: string,
  to: string,
  fields: string
) {
  return fetchAllPages<MetaInsight>(
    `${BASE}/${config.adAccountId}/insights?${buildInsightsParams(
      fields,
      from,
      to,
      config.token,
      "ad"
    ).toString()}`
  );
}

async function fetchChunkedAdInsights(
  config: AdsConfig,
  from: string,
  to: string,
  fields: string
) {
  const chunkInsights: MetaInsight[] = [];

  for (const chunk of buildDateChunks(from, to)) {
    chunkInsights.push(...(await fetchAdInsights(config, chunk.from, chunk.to, fields)));
  }

  return mergeInsightsByAd(chunkInsights);
}

function didAdRunInPeriod(ad: Ad) {
  return (
    ad.insights.impressions > 0 ||
    ad.insights.spend > 0 ||
    ad.insights.reach > 0 ||
    ad.insights.clicks > 0
  );
}

function creativeText(creative: MetaCreative | undefined) {
  return (
    creative?.body ||
    creative?.object_story_spec?.link_data?.message ||
    creative?.object_story_spec?.photo_data?.caption ||
    creative?.object_story_spec?.video_data?.message ||
    ""
  ).trim();
}

export async function fetchAdsPerformanceSnapshot(
  config: AdsConfig,
  from: string,
  to: string
): Promise<AdsPerformanceSnapshot> {
  const baseInsightFields =
    "spend,reach,impressions,clicks,actions,action_values,account_currency,cpm,ctr";
  const videoInsightFields =
    "video_play_actions,video_avg_time_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions";
  const baseAdInsightFields =
    `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${baseInsightFields}`;
  const enhancedAdInsightFields = `${baseAdInsightFields},${videoInsightFields}`;

  let accountInsight: AdInsight | null = null;
  try {
    const accountData = await fetchJSON<MetaListResponse<MetaInsight>>(
      `${BASE}/${config.adAccountId}/insights?fields=spend,reach,impressions,clicks,actions,action_values,account_currency,cpm,ctr&time_range=${encodeURIComponent(
        JSON.stringify({ since: from, until: to })
      )}&level=account&use_account_attribution_setting=true&access_token=${config.token}`
    );

    if (Array.isArray(accountData.data) && accountData.data[0]) {
      accountInsight = buildInsight(accountData.data[0]);
    }
  } catch {
    accountInsight = null;
  }

  let allInsights: MetaInsight[];
  try {
    allInsights = await fetchAdInsights(config, from, to, enhancedAdInsightFields);
  } catch {
    try {
      allInsights = await fetchAdInsights(config, from, to, baseAdInsightFields);
    } catch {
      allInsights = await fetchChunkedAdInsights(config, from, to, baseAdInsightFields);
    }
  }

  const periodInsights = allInsights.filter(
    (ins): ins is MetaInsight & { ad_id: string } => Boolean(ins.ad_id)
  );

  let rawAds: MetaAd[] = [];

  try {
    rawAds = await fetchNodesByIds<MetaAd>(
      periodInsights.map((ins) => ins.ad_id),
      "id,name,status,campaign_id,adset_id,creative{thumbnail_url,image_url,video_id,body,object_story_spec{link_data{message},photo_data{caption},video_data{message}}},effective_status",
      config.token
    );
  } catch {
    rawAds = [];
  }

  const campaignIds = Array.from(
    new Set([
      ...periodInsights.map((ins) => ins.campaign_id || ""),
      ...rawAds.map((ad) => ad.campaign_id || ""),
    ].filter(Boolean))
  );
  const adSetIds = Array.from(
    new Set([
      ...periodInsights.map((ins) => ins.adset_id || ""),
      ...rawAds.map((ad) => ad.adset_id || ""),
    ].filter(Boolean))
  );

  let rawCampaigns: MetaCampaign[] = [];
  let rawAdSets: MetaAdSet[] = [];

  try {
    rawCampaigns = await fetchNodesByIds<MetaCampaign>(
      campaignIds,
      "id,name,objective,status,effective_status",
      config.token
    );
  } catch {
    rawCampaigns = [];
  }

  try {
    rawAdSets = await fetchNodesByIds<MetaAdSet>(
      adSetIds,
      "id,name,status,campaign_id,daily_budget,lifetime_budget,effective_status",
      config.token
    );
  } catch {
    rawAdSets = [];
  }

  const campMap: Record<string, MetaCampaign> = {};
  const adSetMap: Record<string, MetaAdSet> = {};
  const adMap: Record<string, MetaAd> = {};

  for (const campaign of rawCampaigns) campMap[campaign.id] = campaign;
  for (const adSet of rawAdSets) adSetMap[adSet.id] = adSet;
  for (const ad of rawAds) adMap[ad.id] = ad;

  const builtAds: AdsCreativeAd[] = periodInsights.map((ins) => {
    const ad = adMap[ins.ad_id] || {};
    const campaignId = ad.campaign_id || ins.campaign_id || "";
    const adSetId = ad.adset_id || ins.adset_id || "";
    const campaign = campMap[campaignId] || {};
    const adSet = adSetMap[adSetId] || {};
    const creative = ad.creative || {};
    const thumbnail = creative.image_url || creative.thumbnail_url || null;
    const videoId = creative.video_id || null;
    const insight = buildInsight(ins);
    const status =
      ad.effective_status ||
      ad.status ||
      (insight.impressions > 0 || insight.spend > 0 || insight.reach > 0 || insight.clicks > 0
        ? "ACTIVE"
        : "UNKNOWN");

    return {
      id: ins.ad_id,
      name: ad.name || ins.ad_name || "Unknown Ad",
      status,
      adSetId,
      adSetName: adSet.name || ins.adset_name || "Unknown Ad Set",
      campaignId,
      campaignName: campaign.name || ins.campaign_name || "Unknown Campaign",
      campaignObjective: campaign.objective || "",
      dailyBudget: adSet.daily_budget ? Number(adSet.daily_budget) / 100 : null,
      lifetimeBudget: adSet.lifetime_budget ? Number(adSet.lifetime_budget) / 100 : null,
      thumbnail,
      videoId,
      isVideo: !!videoId,
      insights: insight,
      creativeText: creativeText(creative),
    };
  });

  const adsWithData = builtAds.filter((ad) => didAdRunInPeriod(ad) || ad.insights.leads > 0);
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
        .map<AdSet>((adSet) => ({
          id: adSet.id,
          name: adSet.name,
          status: adSet.effective_status || adSet.status || "UNKNOWN",
          dailyBudget: adSet.daily_budget ? Number(adSet.daily_budget) / 100 : null,
          lifetimeBudget: adSet.lifetime_budget ? Number(adSet.lifetime_budget) / 100 : null,
          ads: adsWithData.filter((ad) => ad.adSetId === adSet.id),
        }))
        .filter((adSet) => adSet.ads.length > 0),
    }))
    .filter((campaign) => campaign.adSets.length > 0);

  return {
    ads: adsWithData,
    campaigns: groupedCampaigns,
    accountInsight,
  };
}
