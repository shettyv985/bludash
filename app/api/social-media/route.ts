// C:\Users\Varun Shetty\Desktop\New folder\bludash\app\api\social-media\route.ts
import { NextRequest, NextResponse } from "next/server";

const CLIENT_CONFIG: Record<string, { token: string; fbPageId: string; igUserId: string; adAccountId: string }> = {
  GEOJIT: {
    token: process.env.GEOJIT_TOKEN!,
    fbPageId: process.env.GEOJIT_FB_PAGE_ID!,
    igUserId: process.env.GEOJIT_IG_USER_ID!,
    adAccountId: process.env.GEOJIT_AD_ACCOUNT_ID!,
  },
  CHAKOLAS: {
    token: process.env.CHAKOLAS_TOKEN!,
    fbPageId: process.env.CHAKOLAS_FB_PAGE_ID!,
    igUserId: process.env.CHAKOLAS_IG_USER_ID!,
    adAccountId: process.env.CHAKOLAS_AD_ACCOUNT_ID!,
  },
  HALWAHAWELI: {
    token: process.env.HALWAHAWELI_TOKEN!,
    fbPageId: process.env.HALWAHAWELI_FB_PAGE_ID!,
    igUserId: process.env.HALWAHAWELI_IG_USER_ID!,
    adAccountId: process.env.HALWAHAWELI_AD_ACCOUNT_ID!,
  },
  ABADBuilders: {
    token: process.env.ABADBuilders_TOKEN!,
    fbPageId: process.env.ABADBuilders_FB_PAGE_ID!,
    igUserId: process.env.ABADBuilders_IG_USER_ID!,
    adAccountId: process.env.ABADBuilders_AD_ACCOUNT_ID!,
  },
  Zeiq: {
    token: process.env.Zeiq_TOKEN!,
    fbPageId: process.env.Zeiq_FB_PAGE_ID!,
    igUserId: process.env.Zeiq_IG_USER_ID!,
    adAccountId: process.env.Zeiq_AD_ACCOUNT_ID!,
  },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const client = searchParams.get("client");

  if (!client) return NextResponse.json({ error: "Missing client" }, { status: 400 });

  const config = CLIENT_CONFIG[client];
  if (!config) return NextResponse.json({ error: "Invalid client" }, { status: 400 });

  return NextResponse.json(config);
}