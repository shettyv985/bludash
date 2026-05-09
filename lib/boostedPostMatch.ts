export type BoostPlatform = "FB" | "IG" | "UNKNOWN";

export type BoostedMatchLike = {
  platform?: BoostPlatform;
  body?: string;
  amountSpent?: string;
};

export type PostMatchLike = {
  id: string;
  message: string;
};

export function normalizedIdKeys(id: string): string[] {
  const clean = String(id || "").trim();
  if (!clean) return [];
  const keys = new Set([clean]);
  const parts = clean.split("_").filter(Boolean);
  if (parts.length > 1) keys.add(parts[parts.length - 1]);
  return [...keys];
}

export function postPlatform(postId: string): Exclude<BoostPlatform, "UNKNOWN"> {
  return postId.includes("_") ? "FB" : "IG";
}

export function normalizeCaption(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function legacyCaptionKey(value: string): string {
  return String(value || "").trim().substring(0, 100).toLowerCase();
}

function legacyCaptionMatches(postCaption: string, boostedCaption: string): boolean {
  const post = String(postCaption || "").trim().toLowerCase();
  const boosted = String(boostedCaption || "").trim().toLowerCase();
  if (!post || !boosted) return false;

  const postKey = legacyCaptionKey(post);
  const boostedKey = legacyCaptionKey(boosted);
  if (postKey && boostedKey && postKey === boostedKey) return true;

  const postPrefix = post.substring(0, 80);
  const boostedPrefix = boosted.substring(0, 80);
  if (boostedPrefix.length >= 20 && post.startsWith(boostedPrefix)) return true;
  if (postPrefix.length >= 20 && boosted.startsWith(postPrefix)) return true;

  return false;
}

export function captionLookupKeys(
  platform: BoostPlatform,
  caption: string
): string[] {
  const normalized = normalizeCaption(caption);
  const legacy = legacyCaptionKey(caption);
  if (!normalized && !legacy) return [];

  const platforms: BoostPlatform[] = platform === "UNKNOWN" ? ["FB", "IG"] : [platform];
  const keys = new Set<string>();

  for (const targetPlatform of platforms) {
    if (normalized) keys.add(`caption:${targetPlatform}:${normalized}`);
    if (legacy) keys.add(`legacy-caption:${targetPlatform}:${legacy}`);
  }

  return [...keys];
}

function platformMatches(
  requested: Exclude<BoostPlatform, "UNKNOWN">,
  boosted?: BoostPlatform
) {
  return !boosted || boosted === "UNKNOWN" || boosted === requested;
}

function bestBySpend<T extends BoostedMatchLike>(items: T[]): T | null {
  return (
    items.sort(
      (a, b) =>
        parseFloat(b.amountSpent || "0") - parseFloat(a.amountSpent || "0")
    )[0] || null
  );
}

function uniqueEntries<T extends BoostedMatchLike>(
  boostedMap: Record<string, T>
): T[] {
  return [...new Set(Object.values(boostedMap))];
}

export function findBoostedMatch<T extends BoostedMatchLike>(
  post: PostMatchLike,
  boostedMap: Record<string, T>
): T | null {
  const platform = postPlatform(post.id);

  for (const id of normalizedIdKeys(post.id)) {
    const platformDirect = boostedMap[`post:${platform}:${id}`];
    if (platformDirect) return platformDirect;
  }

  for (const id of normalizedIdKeys(post.id)) {
    const direct = boostedMap[`post:${id}`];
    if (direct && platformMatches(platform, direct.platform)) return direct;
  }

  const oldStyleDirect = boostedMap[legacyCaptionKey(post.message)];
  if (oldStyleDirect && platformMatches(platform, oldStyleDirect.platform)) {
    return oldStyleDirect;
  }

  for (const key of captionLookupKeys(platform, post.message)) {
    const direct = boostedMap[key];
    if (direct) return direct;
  }

  const legacyMatches = uniqueEntries(boostedMap).filter(
    (entry) =>
      platformMatches(platform, entry.platform) &&
      legacyCaptionMatches(post.message, entry.body || "")
  );

  return bestBySpend(legacyMatches);
}
