import { NextRequest, NextResponse } from "next/server";
import {
  getMetaClientConfig,
  getMissingMetaConfigFields,
} from "@/lib/metaClientConfig";
import { fetchAdsPerformanceSnapshot } from "@/lib/metaAdsPerformanceServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const client = searchParams.get("client");
  const optional = searchParams.get("optional") === "1";
  const wantsSnapshot = searchParams.get("snapshot") === "1";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!client) {
    return NextResponse.json({ error: "Missing client" }, { status: 400 });
  }

  const config = getMetaClientConfig(client);

  if (!config) {
    return NextResponse.json({ error: "Invalid client" }, { status: 400 });
  }

  if (!config.token || !config.adAccountId) {
    const missing = getMissingMetaConfigFields(config, "ads");
    return NextResponse.json(
      {
        error: `Missing Meta Ads configuration for client ${client}`,
        missing,
      },
      { status: optional ? 200 : 500 }
    );
  }

  if (wantsSnapshot) {
    if (!from || !to) {
      return NextResponse.json({ error: "Missing date range" }, { status: 400 });
    }

    try {
      const snapshot = await fetchAdsPerformanceSnapshot(
        { token: config.token, adAccountId: config.adAccountId },
        from,
        to
      );

      return NextResponse.json({
        ...snapshot,
        token: config.token,
        adAccountId: config.adAccountId,
        adAccountName: config.adAccountName,
        clientName: config.clientName,
      });
    } catch (err) {
      return NextResponse.json(
        { error: getErrorMessage(err) },
        { status: optional ? 200 : 500 }
      );
    }
  }

  return NextResponse.json({
    token: config.token,
    adAccountId: config.adAccountId,
    adAccountName: config.adAccountName,
    clientName: config.clientName,
    fbPageId: config.fbPageId || null,
    igUserId: config.igUserId || null,
    igProfileUrl: config.igProfileUrl || null,
    igUsername: config.igUsername || null,
  });
}
