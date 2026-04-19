import { NextRequest, NextResponse } from "next/server";

const CLIENT_CONFIG: Record<string, { token: string; adAccountId: string }> = {
  GEOJIT: {
    token: process.env.GEOJIT_TOKEN!,
    adAccountId: process.env.GEOJIT_AD_ACCOUNT_ID!,
  },
  CHAKOLAS: {
    token: process.env.CHAKOLAS_TOKEN!,
    adAccountId: process.env.CHAKOLAS_AD_ACCOUNT_ID!,
  },
  HALWAHAWELI: {
    token: process.env.HALWAHAWELI_TOKEN!,
    adAccountId: process.env.HALWAHAWELI_AD_ACCOUNT_ID!,
  },
  ABADBuilders: {
    token: process.env.ABADBuilders_TOKEN!,
    adAccountId: process.env.ABADBuilders_AD_ACCOUNT_ID!,
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