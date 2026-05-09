export type MetaClientConfig = {
  clientKey: string;
  clientName: string;
  token: string;
  adAccountId: string;
  adAccountName: string;
  fbPageId: string;
  igUserId: string;
};

const CLIENT_NAMES: Record<string, string> = {
  ABADBuilders: "ABAD Builders",
  AngelLungies: "Angel Lungies",
  GEOJIT: "GEOJIT",
  CHAKOLAS: "CHAKOLAS",
  HALWAHAWELI: "HALWA HAWELI",
  Zeiq: "Zeiq Consultants",
};

const ENV_PREFIXES = [
  "ABADBuilders",
  "AngelLungies",
  "GEOJIT",
  "CHAKOLAS",
  "HALWAHAWELI",
  "Zeiq",
] as const;

export type MetaClientKey = (typeof ENV_PREFIXES)[number];

function fromEnv(prefix: MetaClientKey): MetaClientConfig {
  const clientName = process.env[`${prefix}_AD_ACCOUNT_NAME`] || CLIENT_NAMES[prefix] || prefix;

  return {
    clientKey: prefix,
    clientName,
    token: process.env[`${prefix}_TOKEN`] || "",
    adAccountId: process.env[`${prefix}_AD_ACCOUNT_ID`] || "",
    adAccountName: clientName,
    fbPageId: process.env[`${prefix}_FB_PAGE_ID`] || "",
    igUserId: process.env[`${prefix}_IG_USER_ID`] || "",
  };
}

export function getMetaClientConfig(client: string | null): MetaClientConfig | null {
  if (!client || !ENV_PREFIXES.includes(client as MetaClientKey)) return null;
  return fromEnv(client as MetaClientKey);
}
