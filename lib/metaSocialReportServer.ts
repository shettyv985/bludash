import type {
  ReachBreakdown,
  SocialPost,
  SocialReportPayload,
} from "@/lib/buildSocialReportPayload";
import { buildSocialReportPayload } from "@/lib/buildSocialReportPayload";
import { findBoostedMatch } from "@/lib/boostedPostMatch";
import type { BoostedPost } from "@/lib/metaBoostedPostsServer";
import type { MetaClientConfig } from "@/lib/metaClientConfig";

const BASE = "https://graph.facebook.com/v25.0";
const META_FETCH_TIMEOUT_MS = 20000;

type MetaErrorResponse = {
  error?: {
    message?: string;
  };
};

type SocialPlatform = "FB" | "IG" | "BOTH";

type FacebookPost = {
  id: string;
  message?: string;
  created_time: string;
  permalink_url: string;
  full_picture?: string;
  reactions?: {
    summary?: {
      total_count?: number;
    };
  };
  comments?: {
    summary?: {
      total_count?: number;
    };
  };
  shares?: {
    count?: number;
  };
  attachments?: {
    data?: Array<{
      media_type?: string;
      media?: {
        source?: string;
      };
    }>;
  };
};

type InstagramPost = {
  id: string;
  caption?: string;
  media_type?: string;
  timestamp: string;
  permalink: string;
  media_url?: string;
  thumbnail_url?: string;
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

type MetricResponse = {
  data?: unknown[];
};

export type SocialReportSnapshot = {
  fbPosts: SocialPost[];
  igPosts: SocialPost[];
  fbFollows: { follows: number; unfollows: number };
  igFollows: { follows: number; unfollows: number };
  fbPageViews: number;
  igProfileViews: number;
  fbReachBreakdown: ReachBreakdown;
  igReachBreakdown: ReachBreakdown;
};

const emptyReach: ReachBreakdown = { total: 0, organic: 0, paid: 0 };

async function fetchJSON<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    const data = (await res.json()) as T & MetaErrorResponse;

    if (data?.error) {
      throw new Error(data.error.message || "Meta API request failed");
    }

    if (!res.ok) {
      throw new Error(`Meta API request failed (${res.status})`);
    }

    return data as T;
  } finally {
    clearTimeout(timeout);
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function igVal(data: unknown, name: string): number {
  const metric = asRecordArray(data).find((item) => item.name === name);

  if (!metric) return 0;
  if (typeof metric.value === "number") return metric.value;
  const values = asRecordArray(metric.values);
  if (values.length > 0) {
    return Number(values[0]?.value) || 0;
  }

  return 0;
}

function insightNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  const record = asRecord(value);
  if (typeof record.value === "number") return record.value;
  return 0;
}

function sumInsightMetric(metric: unknown): number {
  if (!metric) return 0;
  const record = asRecord(metric);
  const totalValue = asRecord(record.total_value);

  if (totalValue.value != null) {
    return insightNumber(totalValue.value);
  }

  const values = asRecordArray(record.values);
  if (values.length > 0) {
    return values.reduce(
      (sum: number, item) => sum + insightNumber(item.value),
      0
    );
  }

  return insightNumber(record.value);
}

function parseInstagramFollowStats(payload: unknown) {
  const firstMetric = asRecordArray(asRecord(payload).data)[0];
  const totalValue = asRecord(firstMetric?.total_value);
  const firstBreakdown = asRecordArray(totalValue.breakdowns)[0];
  const results = asRecordArray(firstBreakdown?.results);

  return results.reduce(
    (stats: { follows: number; unfollows: number }, item) => {
      const dimensions = Array.isArray(item.dimension_values) ? item.dimension_values : [];
      const raw = String(dimensions[0] || "")
        .toUpperCase()
        .replace(/[\s-]/g, "_");
      const value = insightNumber(item.value);

      if (["FOLLOW", "FOLLOWS", "FOLLOWER", "FOLLOWERS"].includes(raw)) {
        stats.follows += value;
      }

      if (
        [
          "UNFOLLOW",
          "UNFOLLOWS",
          "UNFOLLOWER",
          "UNFOLLOWERS",
          "NON_FOLLOWER",
          "NONFOLLOWER",
        ].includes(raw)
      ) {
        stats.unfollows += value;
      }

      return stats;
    },
    { follows: 0, unfollows: 0 }
  );
}

function parseInstagramProfileViews(payload: unknown): number {
  const data = asRecordArray(asRecord(payload).data);
  const metric = data.find((item) => item.name === "profile_views") || data[0];

  return sumInsightMetric(metric);
}

function metricValue(payload: unknown, metricName: string) {
  const metric = asRecordArray(asRecord(payload).data).find((item) => item.name === metricName);
  return asRecordArray(metric?.values).reduce(
    (sum: number, item) => sum + insightNumber(item.value),
    0
  );
}

async function fetchReelMetrics(postId: string, token: string) {
  const empty = {
    views: 0,
    avgWatchTime: null as number | null,
    skipRate: null as number | null,
    holdRate: null as number | null,
  };

  const parseMetrics = (data: unknown[]) => {
    const watchVal = igVal(data, "ig_reels_avg_watch_time");
    const avgWatchTime = watchVal ? Math.round(watchVal / 1000) : null;
    const skipRaw = igVal(data, "reels_skip_rate");
    const skipRate =
      skipRaw != null && skipRaw > 0
        ? skipRaw <= 1
          ? parseFloat((skipRaw * 100).toFixed(1))
          : parseFloat(skipRaw.toFixed(1))
        : null;
    const views = Math.max(
      igVal(data, "views"),
      igVal(data, "plays"),
      igVal(data, "video_views"),
      igVal(data, "ig_reels_aggregated_all_plays_count")
    );
    const holdRate =
      skipRate != null ? parseFloat(Math.max(0, 100 - skipRate).toFixed(1)) : null;

    return {
      views,
      avgWatchTime,
      skipRate,
      holdRate,
    };
  };

  try {
    const data = await fetchJSON<MetricResponse>(
      `${BASE}/${postId}/insights?metric=ig_reels_avg_watch_time,reels_skip_rate,views&period=lifetime&access_token=${token}`
    );
    return parseMetrics(data?.data || []);
  } catch {
    try {
      const [watchData, viewsData] = await Promise.all([
        fetchJSON<MetricResponse>(
          `${BASE}/${postId}/insights?metric=ig_reels_avg_watch_time,reels_skip_rate&period=lifetime&access_token=${token}`
        ),
        fetchJSON<MetricResponse>(
          `${BASE}/${postId}/insights?metric=views&period=lifetime&access_token=${token}`
        ),
      ]);

      return parseMetrics([...(watchData?.data || []), ...(viewsData?.data || [])]);
    } catch {
      return empty;
    }
  }
}

async function fetchFacebookPosts(
  config: MetaClientConfig,
  from: string,
  to: string
): Promise<SocialPost[]> {
  if (!config.fbPageId) return [];

  const rawPosts = await fetchAllPages<FacebookPost>(
    `${BASE}/${config.fbPageId}/posts?fields=id,message,created_time,permalink_url,full_picture,reactions.summary(total_count),comments.summary(total_count),shares,attachments{media_type,media{source}}&since=${from}&until=${to}&limit=100&access_token=${config.token}`
  );

  return Promise.all(
    rawPosts.map(async (post) => {
      const isReel =
        post.permalink_url?.includes("/reel/") ||
        post.permalink_url?.includes("/videos/");
      const mediaUrl = post.attachments?.data?.[0]?.media?.source || null;
      const likes = post.reactions?.summary?.total_count ?? 0;
      const comments = post.comments?.summary?.total_count ?? 0;
      const shares = post.shares?.count ?? 0;

      try {
        const insights = await fetchJSON<MetricResponse>(
          `${BASE}/${post.id}/insights?metric=post_impressions_unique&access_token=${config.token}`
        );
        const reachMetric = asRecordArray(insights?.data).find(
          (metric) => metric.name === "post_impressions_unique"
        );
        const reach = insightNumber(asRecordArray(reachMetric?.values)[0]?.value);
        let views = 0;

        if (isReel) {
          try {
            const viewData = await fetchJSON<MetricResponse>(
              `${BASE}/${post.id}/insights?metric=post_video_views&access_token=${config.token}`
            );
            const viewMetric = asRecordArray(viewData?.data).find(
              (metric) => metric.name === "post_video_views"
            );
            views = insightNumber(asRecordArray(viewMetric?.values)[0]?.value);
          } catch {
            views = 0;
          }
        }

        return {
          id: post.id,
          message: post.message || "",
          createdTime: post.created_time,
          permalink: post.permalink_url,
          thumbnail: post.full_picture || null,
          mediaUrl,
          type: isReel ? "REEL" : "IMAGE",
          reach,
          likes,
          comments,
          shares,
          saves: 0,
          views,
          holdRate: null,
          engagementRate:
            reach > 0 ? (((likes + comments + shares) / reach) * 100).toFixed(2) : "0.00",
        };
      } catch {
        return {
          id: post.id,
          message: post.message || "",
          createdTime: post.created_time,
          permalink: post.permalink_url,
          thumbnail: post.full_picture || null,
          mediaUrl,
          type: isReel ? "REEL" : "IMAGE",
          reach: 0,
          likes,
          comments,
          shares,
          saves: 0,
          views: 0,
          holdRate: null,
          engagementRate: "0.00",
        };
      }
    })
  );
}

async function fetchInstagramPosts(
  config: MetaClientConfig,
  from: string,
  to: string
): Promise<SocialPost[]> {
  if (!config.igUserId) return [];

  const rawPosts = await fetchAllPages<InstagramPost>(
    `${BASE}/${config.igUserId}/media?fields=id,caption,media_type,timestamp,permalink,media_url,thumbnail_url&since=${from}&until=${to}&limit=100&access_token=${config.token}`
  );

  return Promise.all(
    rawPosts.map(async (post) => {
      try {
        const insights = await fetchJSON<MetricResponse>(
          `${BASE}/${post.id}/insights?metric=reach,likes,comments,shares,saved&period=lifetime&access_token=${config.token}`
        );
        const reach = igVal(insights?.data, "reach");
        const likes = igVal(insights?.data, "likes");
        const comments = igVal(insights?.data, "comments");
        const shares = igVal(insights?.data, "shares");
        const saves = igVal(insights?.data, "saved");
        const mediaType =
          post.media_type === "VIDEO"
            ? "REEL"
            : post.media_type === "CAROUSEL_ALBUM"
              ? "CAROUSEL"
              : "IMAGE";
        const mediaUrl = mediaType === "REEL" || mediaType === "IMAGE" ? post.media_url || null : null;
        const thumbnail = post.thumbnail_url || (mediaType !== "REEL" ? post.media_url : null) || null;
        let avgWatchTime: number | null = null;
        let skipRate: number | null = null;
        let views = 0;
        let holdRate: number | null = null;

        if (mediaType === "REEL") {
          const reelMeta = await fetchReelMetrics(post.id, config.token);
          views = reelMeta.views;
          avgWatchTime = reelMeta.avgWatchTime;
          skipRate = reelMeta.skipRate;
          holdRate = reelMeta.holdRate;
        }

        return {
          id: post.id,
          message: post.caption || "",
          createdTime: post.timestamp,
          permalink: post.permalink,
          thumbnail,
          mediaUrl,
          type: mediaType,
          reach,
          likes,
          comments,
          shares,
          saves,
          views,
          engagementRate:
            reach > 0 ? (((likes + comments + shares + saves) / reach) * 100).toFixed(2) : "0.00",
          avgWatchTime,
          skipRate,
          holdRate,
        };
      } catch {
        return {
          id: post.id,
          message: post.caption || "",
          createdTime: post.timestamp,
          permalink: post.permalink,
          thumbnail: null,
          mediaUrl: null,
          type: "IMAGE",
          reach: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
          views: 0,
          engagementRate: "0.00",
          avgWatchTime: null,
          skipRate: null,
          holdRate: null,
        };
      }
    })
  );
}

async function fetchAudienceSnapshot(
  config: MetaClientConfig,
  from: string,
  to: string
) {
  const [fbFollows, fbPageViews, igFollows, igProfileViews] = await Promise.all([
    config.fbPageId
      ? fetchJSON<MetricResponse>(
          `${BASE}/${config.fbPageId}/insights?metric=page_daily_follows_unique,page_daily_unfollows_unique&period=day&since=${from}&until=${to}&access_token=${config.token}`
        ).catch(() => null)
      : null,
    config.fbPageId
      ? fetchJSON<MetricResponse>(
          `${BASE}/${config.fbPageId}/insights?metric=page_views_total&period=day&since=${from}&until=${to}&access_token=${config.token}`
        ).catch(() => null)
      : null,
    config.igUserId
      ? fetchJSON<MetricResponse>(
          `${BASE}/${config.igUserId}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=${from}&until=${to}&access_token=${config.token}`
        ).catch(() => null)
      : null,
    config.igUserId
      ? fetchJSON<MetricResponse>(
          `${BASE}/${config.igUserId}/insights?metric=profile_views&metric_type=total_value&period=day&since=${from}&until=${to}&access_token=${config.token}`
        ).catch(() => null)
      : null,
  ]);
  const igFollowStats = parseInstagramFollowStats(igFollows);

  return {
    fbFollows: {
      follows: metricValue(fbFollows, "page_daily_follows_unique"),
      unfollows: metricValue(fbFollows, "page_daily_unfollows_unique"),
    },
    igFollows: {
      follows: igFollowStats.follows,
      unfollows: igFollowStats.unfollows,
    },
    fbPageViews: metricValue(fbPageViews, "page_views_total"),
    igProfileViews: parseInstagramProfileViews(igProfileViews),
  };
}

function buildReachBreakdown(
  posts: SocialPost[],
  boostedMap: Record<string, BoostedPost>
): ReachBreakdown {
  const organic = posts.reduce((sum, post) => sum + post.reach, 0);
  const paid = posts.reduce(
    (sum, post) => sum + (findBoostedMatch(post, boostedMap)?.reach || 0),
    0
  );

  return {
    organic,
    paid,
    total: organic + paid,
  };
}

export async function fetchSocialReportSnapshot(
  config: MetaClientConfig,
  from: string,
  to: string,
  platform: SocialPlatform,
  boostedMap: Record<string, BoostedPost>
): Promise<SocialReportSnapshot> {
  const [audience, fbPosts, igPosts] = await Promise.all([
    fetchAudienceSnapshot(config, from, to),
    platform === "FB" || platform === "BOTH" ? fetchFacebookPosts(config, from, to) : [],
    platform === "IG" || platform === "BOTH" ? fetchInstagramPosts(config, from, to) : [],
  ]);

  return {
    ...audience,
    fbPosts,
    igPosts,
    fbReachBreakdown: fbPosts.length ? buildReachBreakdown(fbPosts, boostedMap) : emptyReach,
    igReachBreakdown: igPosts.length ? buildReachBreakdown(igPosts, boostedMap) : emptyReach,
  };
}

export function buildServerSocialReportPayload(
  snapshot: SocialReportSnapshot,
  boostedMap: Record<string, BoostedPost>,
  config: MetaClientConfig,
  from: string,
  to: string,
  platform: SocialPlatform
): SocialReportPayload {
  const payload = buildSocialReportPayload(
    snapshot.fbPosts,
    snapshot.igPosts,
    boostedMap,
    snapshot.fbFollows,
    snapshot.igFollows,
    snapshot.fbPageViews,
    snapshot.igProfileViews,
    config.clientKey,
    from,
    to,
    platform,
    snapshot.fbReachBreakdown,
    snapshot.igReachBreakdown,
    null
  );

  return {
    ...payload,
    meta: {
      ...payload.meta,
      clientName: config.clientName,
      adAccountId: config.adAccountId,
      adAccountName: config.adAccountName,
    },
  };
}
