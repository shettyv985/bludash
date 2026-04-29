import { NextRequest, NextResponse } from "next/server";

type ClientConfig = {
  token: string;
  adAccountId: string;
  fbPageId?: string;
  igUserId?: string;
};

const CLIENT_CONFIG: Record<string, ClientConfig> = {
  GEOJIT: {
    token: process.env.GEOJIT_TOKEN || "",
    adAccountId: process.env.GEOJIT_AD_ACCOUNT_ID || "",
    fbPageId: process.env.GEOJIT_FB_PAGE_ID || "",
    igUserId: process.env.GEOJIT_IG_USER_ID || "",
  },
  CHAKOLAS: {
    token: process.env.CHAKOLAS_TOKEN || "",
    adAccountId: process.env.CHAKOLAS_AD_ACCOUNT_ID || "",
    fbPageId: process.env.CHAKOLAS_FB_PAGE_ID || "",
    igUserId: process.env.CHAKOLAS_IG_USER_ID || "",
  },
  HALWAHAWELI: {
    token: process.env.HALWAHAWELI_TOKEN || "",
    adAccountId: process.env.HALWAHAWELI_AD_ACCOUNT_ID || "",
    fbPageId: process.env.HALWAHAWELI_FB_PAGE_ID || "",
    igUserId: process.env.HALWAHAWELI_IG_USER_ID || "",
  },
  ABADBuilders: {
    token: process.env.ABADBuilders_TOKEN || "",
    adAccountId: process.env.ABADBuilders_AD_ACCOUNT_ID || "",
    fbPageId: process.env.ABADBuilders_FB_PAGE_ID || "",
    igUserId: process.env.ABADBuilders_IG_USER_ID || "",
  },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const client = searchParams.get("client");

  if (!client) {
    return NextResponse.json({ error: "Missing client" }, { status: 400 });
  }

  const config = CLIENT_CONFIG[client];

  if (!config) {
    return NextResponse.json({ error: "Invalid client" }, { status: 400 });
  }

  if (!config.token || !config.adAccountId) {
    return NextResponse.json(
      { error: `Missing Meta Ads configuration for client ${client}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    token: config.token,
    adAccountId: config.adAccountId,
    fbPageId: config.fbPageId || null,
    igUserId: config.igUserId || null,
  });
}
