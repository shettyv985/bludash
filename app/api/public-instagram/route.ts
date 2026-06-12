import { NextRequest, NextResponse } from "next/server";
import {
  extractInstagramUsername,
  getMetaClientConfig,
} from "@/lib/metaClientConfig";

const IG_APP_ID = "936619743392459";
const WEB_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36";
const FEED_USER_AGENT = "Instagram 219.0.0.12.117 Android";
const MAX_PAGES = 35;
const PAGE_SIZE = 12;

type InstagramProfileResponse = {
  data?: {
    user?: {
      id?: string;
      username?: string;
      full_name?: string;
      biography?: string;
      profile_pic_url_hd?: string;
      profile_pic_url?: string;
      edge_followed_by?: { count?: number };
      edge_owner_to_timeline_media?: {
        count?: number;
        edges?: {
          node?: InstagramProfilePostNode;
        }[];
      };
    };
  };
  status?: string;
  message?: string;
};

type InstagramProfilePostNode = {
  id?: string;
  shortcode?: string;
  taken_at_timestamp?: number;
  is_video?: boolean;
  product_type?: string;
  display_url?: string;
  thumbnail_src?: string;
  edge_liked_by?: { count?: number };
  edge_media_preview_like?: { count?: number };
  edge_media_to_comment?: { count?: number };
  edge_media_to_caption?: {
    edges?: {
      node?: {
        text?: string;
      };
    }[];
  };
};

type InstagramFeedItem = {
  pk?: string;
  id?: string;
  code?: string;
  taken_at?: number;
  like_count?: number;
  comment_count?: number;
  media_type?: number;
  product_type?: string;
  caption?: {
    text?: string;
  };
  image_versions2?: {
    candidates?: { url?: string }[];
  };
  carousel_media?: {
    image_versions2?: {
      candidates?: { url?: string }[];
    };
  }[];
};

type PublicPost = {
  id: string;
  shortcode: string;
  caption: string;
  timestamp: number;
  createdTime: string;
  permalink: string;
  thumbnail: string | null;
  type: string;
  likes: number | null;
  comments: number | null;
  shares: null;
  source?: "instagram" | "manual";
};

type InstagramFeedResponse = {
  items?: InstagramFeedItem[];
  more_available?: boolean;
  next_max_id?: string;
  status?: string;
  message?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function publicInstagramHeaders(userAgent: string, referer: string, cookieHeader = "") {
  const headers: Record<string, string> = {
    "User-Agent": userAgent,
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "X-IG-App-ID": IG_APP_ID,
    Referer: referer,
  };

  if (cookieHeader) headers.Cookie = cookieHeader;
  return headers;
}

function splitSetCookieHeader(value: string) {
  return value.split(/,(?=\s*[^;,]+=)/g).map((cookie) => cookie.trim());
}

function responseCookieHeader(headers: Headers) {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies =
    typeof withGetSetCookie.getSetCookie === "function"
      ? withGetSetCookie.getSetCookie()
      : headers.get("set-cookie")
        ? splitSetCookieHeader(headers.get("set-cookie") || "")
        : [];

  return setCookies
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function mergeCookieHeaders(current: string, next: string) {
  const cookies = new Map<string, string>();
  for (const cookie of [current, next].filter(Boolean).join("; ").split("; ")) {
    const eq = cookie.indexOf("=");
    if (eq <= 0) continue;
    cookies.set(cookie.slice(0, eq), cookie.slice(eq + 1));
  }

  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function fetchJson<T>(
  url: string,
  userAgent: string,
  referer: string,
  cookieHeader = ""
): Promise<{ data: T; cookieHeader: string }> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: publicInstagramHeaders(userAgent, referer, cookieHeader),
  });

  const data = (await res.json()) as T;
  if (!res.ok) {
    throw new Error(`Instagram returned ${res.status}`);
  }

  return {
    data,
    cookieHeader: mergeCookieHeaders(cookieHeader, responseCookieHeader(res.headers)),
  };
}

function dateBounds(from: string, to: string) {
  const since = Date.parse(`${from}T00:00:00.000Z`) / 1000;
  const until = Date.parse(`${to}T23:59:59.999Z`) / 1000;

  return {
    since: Number.isFinite(since) ? since : 0,
    until: Number.isFinite(until) ? until : Number.MAX_SAFE_INTEGER,
  };
}

function mediaTypeLabel(item: InstagramFeedItem) {
  if (item.product_type === "clips") return "REEL";
  if (item.media_type === 8) return "CAROUSEL";
  if (item.media_type === 2) return "VIDEO";
  return "IMAGE";
}

function thumbnailUrl(item: InstagramFeedItem) {
  return (
    item.image_versions2?.candidates?.[0]?.url ||
    item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ||
    null
  );
}

function permalink(item: InstagramFeedItem) {
  if (!item.code) return "";
  const path = item.product_type === "clips" ? "reel" : "p";
  return `https://www.instagram.com/${path}/${item.code}/`;
}

function profileNodeType(node: InstagramProfilePostNode) {
  if (node.product_type === "clips") return "REEL";
  if (node.is_video) return "VIDEO";
  return "IMAGE";
}

function profileNodePermalink(node: InstagramProfilePostNode) {
  if (!node.shortcode) return "";
  const path = node.product_type === "clips" ? "reel" : "p";
  return `https://www.instagram.com/${path}/${node.shortcode}/`;
}

function mapProfileNode(node: InstagramProfilePostNode): PublicPost {
  return {
    id: node.id || node.shortcode || "",
    shortcode: node.shortcode || "",
    caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || "",
    timestamp: node.taken_at_timestamp || 0,
    createdTime: node.taken_at_timestamp
      ? new Date(node.taken_at_timestamp * 1000).toISOString()
      : "",
    permalink: profileNodePermalink(node),
    thumbnail: node.thumbnail_src || node.display_url || null,
    type: profileNodeType(node),
    likes:
      node.edge_liked_by?.count ??
      node.edge_media_preview_like?.count ??
      null,
    comments: node.edge_media_to_comment?.count ?? null,
    shares: null,
    source: "instagram",
  };
}

function mapFeedItem(item: InstagramFeedItem): PublicPost {
  return {
    id: item.pk || item.id || item.code || "",
    shortcode: item.code || "",
    caption: item.caption?.text || "",
    timestamp: item.taken_at || 0,
    createdTime: item.taken_at
      ? new Date(item.taken_at * 1000).toISOString()
      : "",
    permalink: permalink(item),
    thumbnail: thumbnailUrl(item),
    type: mediaTypeLabel(item),
    likes: item.like_count ?? null,
    comments: item.comment_count ?? null,
    shares: null,
    source: "instagram",
  };
}

function shortcodeFromPermalink(permalink: string) {
  const match = permalink.match(/instagram\.com\/(?:p|reel)\/([^/?#]+)/i);
  return match?.[1] || "";
}

function manualPostId(post: Partial<PublicPost> & { date?: string }) {
  return (
    post.id ||
    post.shortcode ||
    shortcodeFromPermalink(post.permalink || "") ||
    `manual:${post.date || post.createdTime || ""}:${String(post.caption || "").slice(0, 40)}`
  );
}

function parseManualPublicPosts(client: string): PublicPost[] {
  const raw = process.env[`${client}_PUBLIC_IG_POSTS_JSON`] || "";
  if (!raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw) as (Partial<PublicPost> & { date?: string })[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((post) => {
        const timestamp = post.timestamp || (post.date ? Date.parse(`${post.date}T12:00:00.000Z`) / 1000 : 0);
        const shortcode = post.shortcode || shortcodeFromPermalink(post.permalink || "");
        const permalink =
          post.permalink ||
          (shortcode ? `https://www.instagram.com/p/${shortcode}/` : "");

        return {
          id: manualPostId({ ...post, shortcode, permalink }),
          shortcode,
          caption: post.caption || "",
          timestamp: Number.isFinite(timestamp) ? timestamp : 0,
          createdTime: Number.isFinite(timestamp) && timestamp > 0
            ? new Date(timestamp * 1000).toISOString()
            : post.createdTime || "",
          permalink,
          thumbnail: post.thumbnail || null,
          type: post.type || "IMAGE",
          likes: post.likes ?? null,
          comments: post.comments ?? null,
          shares: null,
          source: "manual" as const,
        };
      })
      .filter((post) => post.timestamp > 0);
  } catch {
    return [];
  }
}

function filterPostsByDate(posts: PublicPost[], since: number, until: number) {
  return posts
    .filter((post) => post.timestamp >= since && post.timestamp <= until)
    .sort((a, b) => b.timestamp - a.timestamp);
}

function mergePosts(scrapedPosts: PublicPost[], manualPosts: PublicPost[]) {
  const map = new Map<string, PublicPost>();

  for (const post of scrapedPosts) {
    map.set(post.shortcode || post.id, post);
  }

  for (const post of manualPosts) {
    map.set(post.shortcode || post.id, post);
  }

  return [...map.values()].sort((a, b) => b.timestamp - a.timestamp);
}

function postDateRange(posts: PublicPost[]) {
  const timestamps = posts.map((post) => post.timestamp).filter(Boolean);
  if (timestamps.length === 0) {
    return {
      newestDate: null,
      oldestDate: null,
    };
  }

  const newest = Math.max(...timestamps);
  const oldest = Math.min(...timestamps);

  return {
    newestDate: new Date(newest * 1000).toISOString(),
    oldestDate: new Date(oldest * 1000).toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const client = searchParams.get("client");
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  if (!client) return jsonError("Missing client");
  if (!from || !to) return jsonError("Missing date range");

  const config = getMetaClientConfig(client);
  if (!config) return jsonError("Invalid client");

  const username =
    extractInstagramUsername(config.igUsername) ||
    extractInstagramUsername(config.igProfileUrl);

  if (!username) {
    return jsonError(`Missing ${client}_IG_USERNAME or ${client}_IG_PROFILE_URL`);
  }

  const profileUrl = `https://www.instagram.com/${username}/`;
  const profileApi = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;

  try {
    const profileResult = await fetchJson<InstagramProfileResponse>(
      profileApi,
      WEB_USER_AGENT,
      profileUrl
    );
    const profile = profileResult.data;
    let cookieHeader = profileResult.cookieHeader;
    const user = profile.data?.user;
    if (!user?.id) {
      return jsonError("Instagram profile could not be loaded", 502);
    }

    const { since, until } = dateBounds(from, to);
    const seen = new Set<string>();
    const allItems: InstagramFeedItem[] = [];
    const fallbackPosts = (user.edge_owner_to_timeline_media?.edges || [])
      .map((edge) => edge.node)
      .filter((node): node is InstagramProfilePostNode => Boolean(node))
      .map(mapProfileNode);
    let maxId = "";
    let moreAvailable = true;
    let pagesFetched = 0;
    let feedError = "";
    let crossedRequestedStart = false;

    try {
      while (moreAvailable && pagesFetched < MAX_PAGES) {
        const params = new URLSearchParams({ count: String(PAGE_SIZE) });
        if (maxId) params.set("max_id", maxId);

        const feedResult = await fetchJson<InstagramFeedResponse>(
          `https://www.instagram.com/api/v1/feed/user/${user.id}/?${params.toString()}`,
          FEED_USER_AGENT,
          profileUrl,
          cookieHeader
        );
        const feed = feedResult.data;
        cookieHeader = feedResult.cookieHeader;

        for (const item of feed.items || []) {
          const key = item.pk || item.id || item.code || "";
          if (!key || seen.has(key)) continue;
          seen.add(key);
          allItems.push(item);
        }

        pagesFetched += 1;
        const timestamps = allItems.map((item) => Number(item.taken_at || 0)).filter(Boolean);
        const oldestFetchedTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : 0;
        crossedRequestedStart = oldestFetchedTimestamp > 0 && oldestFetchedTimestamp < since;
        moreAvailable = Boolean(feed.more_available && feed.next_max_id);
        if (crossedRequestedStart || !feed.next_max_id || feed.next_max_id === maxId) break;
        maxId = feed.next_max_id;
      }
    } catch (error) {
      feedError =
        error instanceof Error
          ? error.message
          : "Instagram feed endpoint was unavailable";
    }

    const feedPosts = allItems.map(mapFeedItem);
    const scrapedPosts = feedPosts.length > 0 ? feedPosts : fallbackPosts;
    const manualPosts = parseManualPublicPosts(client);
    const sourcePosts = mergePosts(scrapedPosts, manualPosts);
    const posts = filterPostsByDate(sourcePosts, since, until);
    const usedFallback = feedPosts.length === 0;
    const range = postDateRange(sourcePosts);
    const hitPageCap =
      !usedFallback &&
      moreAvailable &&
      pagesFetched >= MAX_PAGES &&
      !crossedRequestedStart;
    const rangeFullyCovered =
      !usedFallback &&
      (crossedRequestedStart || !moreAvailable) &&
      sourcePosts.some((post) => post.timestamp <= since);

    return NextResponse.json({
      profile: {
        username: user.username || username,
        fullName: user.full_name || "",
        biography: user.biography || "",
        profilePic: user.profile_pic_url_hd || user.profile_pic_url || null,
        followers: user.edge_followed_by?.count ?? null,
        totalPosts: user.edge_owner_to_timeline_media?.count ?? null,
        profileUrl,
      },
      posts,
      summary: {
        posts: posts.length,
        likes: posts.reduce((sum, post) => sum + (post.likes || 0), 0),
        comments: posts.reduce((sum, post) => sum + (post.comments || 0), 0),
        shares: null,
      },
      coverage: {
        fetchedPosts: sourcePosts.length,
        scrapedPosts: scrapedPosts.length,
        manualPosts: manualPosts.length,
        pagesFetched,
        maxPages: MAX_PAGES,
        moreAvailable,
        limited: usedFallback || hitPageCap,
        source: usedFallback ? "profile" : "feed",
        rangeFullyCovered,
        hitPageCap,
        oldestPostDate: range.oldestDate,
        newestPostDate: range.newestDate,
        warning: usedFallback
          ? `${feedError || "Instagram feed pagination was unavailable"}; showing only the 12 recent public posts exposed by the profile endpoint, so older date ranges may be incomplete.`
          : hitPageCap
            ? `Fetched ${sourcePosts.length} public posts but hit the ${MAX_PAGES}-page safety limit before reaching the selected start date.`
          : "",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch public Instagram posts",
      },
      { status: 502 }
    );
  }
}
