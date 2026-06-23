export type MetaClientConfig = {
  clientKey: string;
  clientName: string;
  token: string;
  adAccountId: string;
  adAccountName: string;
  fbPageId: string;
  igUserId: string;
  igProfileUrl: string;
  igUsername: string;
  igConfigSource: "env_id" | "linked_page" | "profile_url" | "username" | "";
  igResolveError?: string;
};

const GRAPH_BASE = "https://graph.facebook.com/v25.0";

const CLIENT_NAMES: Record<string, string> = {
  ABADBuilders: "ABAD Builders",
  AngelHomes: "Angel Homes",
  AngelLungies: "Angel Lungies",
  Benjiesallday: "Benjiesallday",
  BluCampus: "BluCampus",
  Blusteak_Media: "Blusteak Media",
  CHAKOLAS: "CHAKOLAS",
  Care_n_Cure_Pharmacy: "Care n Cure Pharmacy",
  GEOJIT: "GEOJIT",
  Heal_in_Kerala: "Heal in Kerala",
  HALWAHAWELI: "HALWA HAWELI",
  IncheonKia: "Incheon Kia",
  Kendamil_Qatar: "Kendamil Qatar",
  Kulud: "Kulud",
  MemoryTrain: "Memory Train",
  Mothers_Food: "Mothers Food",
  SpacesECO_Clean: "Spaces ECO Clean",
  
  
};

const ENV_PREFIXES = [
  "ABADBuilders",
  "AngelHomes",
  "AngelLungies",
  "Benjiesallday",
  "BluCampus",
  "Blusteak_Media",
  "CHAKOLAS",
  "Care_n_Cure_Pharmacy",
  "Ekabrahmaa",
  "GEOJIT",
  "Heal_in_Kerala",
  "HALWAHAWELI",
  "IncheonKia",
  "Kendamil_Qatar",
  "Kulud",
  "MemoryTrain",
  "Mothers_Food",
  "SpacesECO_Clean",
] as const;

export type MetaClientKey = (typeof ENV_PREFIXES)[number];

function cleanEnvValue(value: string | undefined): string {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

export function extractInstagramUsername(value: string): string {
  const clean = cleanEnvValue(value).trim();
  if (!clean) return "";

  const withoutAt = clean.startsWith("@") ? clean.slice(1) : clean;

  try {
    const parsed = new URL(withoutAt);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "instagram.com") return "";
    return (parsed.pathname.split("/").filter(Boolean)[0] || "").trim();
  } catch {
    return withoutAt
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .split(/[/?#]/)[0]
      .trim();
  }
}

function fromEnv(prefix: MetaClientKey): MetaClientConfig {
  const clientName =
    cleanEnvValue(process.env[`${prefix}_AD_ACCOUNT_NAME`]) ||
    CLIENT_NAMES[prefix] ||
    prefix;
  const rawIgUserId = cleanEnvValue(process.env[`${prefix}_IG_USER_ID`]);
  const igProfileUrl =
    cleanEnvValue(process.env[`${prefix}_IG_PROFILE_URL`]) ||
    (rawIgUserId.includes("instagram.com") ? rawIgUserId : "");
  const igUsername =
    cleanEnvValue(process.env[`${prefix}_IG_USERNAME`]) ||
    extractInstagramUsername(igProfileUrl);
  const igUserId = rawIgUserId.includes("instagram.com") ? "" : rawIgUserId;

  return {
    clientKey: prefix,
    clientName,
    token:
      cleanEnvValue(process.env[`${prefix}_TOKEN`]) ||
      cleanEnvValue(process.env[`${prefix}_Token`]),
    adAccountId: cleanEnvValue(process.env[`${prefix}_AD_ACCOUNT_ID`]),
    adAccountName: clientName,
    fbPageId: cleanEnvValue(process.env[`${prefix}_FB_PAGE_ID`]),
    igUserId,
    igProfileUrl,
    igUsername,
    igConfigSource: igUserId ? "env_id" : igProfileUrl ? "profile_url" : igUsername ? "username" : "",
  };
}

export function getMetaClientConfig(client: string | null): MetaClientConfig | null {
  if (!client || !ENV_PREFIXES.includes(client as MetaClientKey)) return null;
  return fromEnv(client as MetaClientKey);
}

type LinkedInstagramAccount = {
  id?: string;
  username?: string;
};

type PageInstagramResponse = {
  instagram_business_account?: LinkedInstagramAccount;
  connected_instagram_account?: LinkedInstagramAccount;
  error?: {
    message?: string;
  };
};

function normalizeUsername(username: string) {
  return extractInstagramUsername(username).toLowerCase();
}

const RESOLVED_CONFIG_CACHE_TTL_MS = 10 * 60 * 1000;
const RESOLVED_CONFIG_ERROR_CACHE_TTL_MS = 60 * 1000;

type ResolvedConfigCacheEntry = {
  expiresAt: number;
  value: MetaClientConfig;
};

const resolvedConfigCache = new Map<string, ResolvedConfigCacheEntry>();
const resolvedConfigInFlight = new Map<string, Promise<MetaClientConfig | null>>();

function resolvedConfigCacheKey(config: MetaClientConfig) {
  return [
    config.clientKey,
    config.fbPageId,
    config.igUsername,
    config.token.length,
    config.token.slice(-12),
  ].join(":");
}

function getCachedResolvedConfig(key: string) {
  const cached = resolvedConfigCache.get(key);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    resolvedConfigCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCachedResolvedConfig(key: string, value: MetaClientConfig) {
  const ttl = value.igResolveError
    ? RESOLVED_CONFIG_ERROR_CACHE_TTL_MS
    : RESOLVED_CONFIG_CACHE_TTL_MS;

  resolvedConfigCache.set(key, {
    expiresAt: Date.now() + ttl,
    value,
  });
}

async function resolveLinkedInstagramConfig(
  config: MetaClientConfig
): Promise<MetaClientConfig> {
  const params = new URLSearchParams({
    fields: "instagram_business_account{id,username},connected_instagram_account{id,username}",
    access_token: config.token,
  });

  try {
    const res = await fetch(`${GRAPH_BASE}/${config.fbPageId}?${params.toString()}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as PageInstagramResponse;

    if (data.error) {
      return {
        ...config,
        igResolveError: data.error.message || "Could not resolve Instagram account from Facebook Page",
      };
    }

    const linked =
      data.instagram_business_account ||
      data.connected_instagram_account ||
      null;
    if (!linked?.id) return config;

    const expectedUsername = normalizeUsername(config.igUsername);
    const linkedUsername = normalizeUsername(linked.username || "");

    if (expectedUsername && linkedUsername && expectedUsername !== linkedUsername) {
      return {
        ...config,
        igResolveError: `Facebook Page is linked to @${linked.username}, not @${config.igUsername}`,
      };
    }

    return {
      ...config,
      igUserId: linked.id,
      igUsername: config.igUsername || linked.username || "",
      igConfigSource: "linked_page",
    };
  } catch {
    return {
      ...config,
      igResolveError: "Could not resolve Instagram account from Facebook Page",
    };
  }
}

export async function getResolvedMetaClientConfig(
  client: string | null
): Promise<MetaClientConfig | null> {
  const config = getMetaClientConfig(client);
  if (!config || config.igUserId || !config.token || !config.fbPageId) return config;

  const cacheKey = resolvedConfigCacheKey(config);
  const cached = getCachedResolvedConfig(cacheKey);
  if (cached) return cached;

  const inFlight = resolvedConfigInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const pending = resolveLinkedInstagramConfig(config)
    .then((resolved) => {
      setCachedResolvedConfig(cacheKey, resolved);
      return resolved;
    })
    .finally(() => {
      resolvedConfigInFlight.delete(cacheKey);
    });

  resolvedConfigInFlight.set(cacheKey, pending);
  return pending;
}

export function getMissingMetaConfigFields(
  config: MetaClientConfig,
  scope: "ads" | "social"
): string[] {
  const missing: string[] = [];

  if (!config.token) missing.push(`${config.clientKey}_TOKEN`);
  if (scope === "ads" && !config.adAccountId) missing.push(`${config.clientKey}_AD_ACCOUNT_ID`);
  if (scope === "social" && !config.fbPageId) missing.push(`${config.clientKey}_FB_PAGE_ID`);
  if (scope === "social" && !config.igUserId) missing.push(`${config.clientKey}_IG_USER_ID`);

  return missing;
}
