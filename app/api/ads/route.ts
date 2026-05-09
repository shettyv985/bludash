import { NextRequest, NextResponse } from "next/server";
import { getMetaClientConfig } from "@/lib/metaClientConfig";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const client = searchParams.get("client");

  if (!client) {
    return NextResponse.json({ error: "Missing client" }, { status: 400 });
  }

  const config = getMetaClientConfig(client);

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
    adAccountName: config.adAccountName,
    clientName: config.clientName,
    fbPageId: config.fbPageId || null,
    igUserId: config.igUserId || null,
  });
}
