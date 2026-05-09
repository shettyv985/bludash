// C:\Users\Varun Shetty\Desktop\New folder\bludash\app\api\social-media\route.ts
import { NextRequest, NextResponse } from "next/server";
import { getMetaClientConfig } from "@/lib/metaClientConfig";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const client = searchParams.get("client");

  if (!client) return NextResponse.json({ error: "Missing client" }, { status: 400 });

  const config = getMetaClientConfig(client);
  if (!config) return NextResponse.json({ error: "Invalid client" }, { status: 400 });

  return NextResponse.json(config);
}
