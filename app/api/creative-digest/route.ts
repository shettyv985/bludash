import { NextRequest, NextResponse } from "next/server";
import { runCreativeDigest } from "@/lib/creativeDigest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const auth = req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");

  return auth === `Bearer ${secret}` || querySecret === secret;
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

function isManualTriggerAllowed(req: NextRequest) {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.CREATIVE_DIGEST_MANUAL_ENABLED === "1") return true;
  return isAuthorized(req);
}

function normalizeMode(value: unknown) {
  if (value === "performance" || value === "social" || value === "both") {
    return value;
  }

  return "both";
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const recipient = req.nextUrl.searchParams.get("toEmail") || undefined;

  try {
    const result = await runCreativeDigest({
      from,
      to,
      dryRun,
      recipient,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("creative-digest unhandled error:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isManualTriggerAllowed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    client?: string;
    clients?: string[];
    from?: string;
    to?: string;
    mode?: string;
    dryRun?: boolean;
    toEmail?: string;
  } = {};

  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const clientKeys = Array.isArray(body.clients)
    ? body.clients
    : body.client
      ? [body.client]
      : [];

  if (clientKeys.length === 0) {
    return NextResponse.json({ error: "Select a client before sending email" }, { status: 400 });
  }

  try {
    const result = await runCreativeDigest({
      clientKeys,
      from: body.from || undefined,
      to: body.to || undefined,
      mode: normalizeMode(body.mode),
      dryRun: body.dryRun === true,
      recipient: body.toEmail || undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("creative-digest manual trigger error:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
