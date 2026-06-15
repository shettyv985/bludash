import { useCallback, useEffect, useState } from "react";

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
  hookRate: number;
  skipRate: number;
  videoAvgWatchTime: number | null;
  videoP25: number;
  videoP50: number;
  videoP75: number;
  videoP95: number;
  videoP100: number;
  thruPlays: number;
  holdRate50: number;
  completionRate: number;
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

type AdsPerformanceSnapshot = {
  ads: Ad[];
  campaigns: Campaign[];
  accountInsight: AdInsight | null;
  token: string;
};

type AdsPerformanceCacheEntry = {
  expiresAt: number;
  value: AdsPerformanceSnapshot;
};

type AdsPerformanceResponse = Partial<AdsPerformanceSnapshot> & {
  error?: string;
};

const ADS_PERFORMANCE_CACHE_TTL_MS = 5 * 60 * 1000;
const adsPerformanceCache = new Map<string, AdsPerformanceCacheEntry>();
const adsPerformanceInFlight = new Map<string, Promise<AdsPerformanceSnapshot>>();

function getCachedAdsPerformance(key: string) {
  const cached = adsPerformanceCache.get(key);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    adsPerformanceCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCachedAdsPerformance(key: string, value: AdsPerformanceSnapshot) {
  adsPerformanceCache.set(key, {
    expiresAt: Date.now() + ADS_PERFORMANCE_CACHE_TTL_MS,
    value,
  });
}

function buildEmptySnapshot(token = ""): AdsPerformanceSnapshot {
  return {
    ads: [],
    campaigns: [],
    accountInsight: null,
    token,
  };
}

function normalizeSnapshot(data: AdsPerformanceResponse): AdsPerformanceSnapshot {
  return {
    ads: Array.isArray(data.ads) ? data.ads : [],
    campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
    accountInsight: data.accountInsight || null,
    token: typeof data.token === "string" ? data.token : "",
  };
}

export function useAdsPerformance(
  client: string,
  from: string,
  to: string,
  enabled = true
): UseAdsPerformanceResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ads, setAds] = useState<Ad[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accountInsight, setAccountInsight] = useState<AdInsight | null>(null);
  const [token, setToken] = useState("");

  const applySnapshot = useCallback((snapshot: AdsPerformanceSnapshot) => {
    setAds(snapshot.ads);
    setCampaigns(snapshot.campaigns);
    setAccountInsight(snapshot.accountInsight);
    setToken(snapshot.token);
  }, []);

  const fetchPerformance = useCallback(async () => {
    if (!enabled || !client || !from || !to) {
      applySnapshot(buildEmptySnapshot());
      setLoading(false);
      return;
    }

    const cacheKey = `${client}|${from}|${to}`;
    const cached = getCachedAdsPerformance(cacheKey);
    if (cached) {
      applySnapshot(cached);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      let pending = adsPerformanceInFlight.get(cacheKey);
      if (!pending) {
        pending = (async () => {
          const params = new URLSearchParams({
            client,
            from,
            to,
            snapshot: "1",
          });
          const res = await fetch(`/api/ads?${params.toString()}`, {
            cache: "no-store",
          });
          const data = (await res.json()) as AdsPerformanceResponse;

          if (!res.ok) {
            throw new Error(data.error || "Failed to fetch ads performance");
          }

          const snapshot = normalizeSnapshot(data);
          setCachedAdsPerformance(cacheKey, snapshot);
          return snapshot;
        })().finally(() => {
          adsPerformanceInFlight.delete(cacheKey);
        });
        adsPerformanceInFlight.set(cacheKey, pending);
      }

      applySnapshot(await pending);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch ads performance");
      applySnapshot(buildEmptySnapshot());
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, client, enabled, from, to]);

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
