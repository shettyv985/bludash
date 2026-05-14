// C:\Users\Varun Shetty\Desktop\New folder\bludash\app\api\proxy-video\route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  try {
    const range = req.headers.get("range");
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...(range ? { Range: range } : {}),
      },
    });

    if (!res.ok) return new NextResponse("Failed to fetch video", { status: res.status });

    const contentType = res.headers.get("content-type") || "video/mp4";
    const contentLength = res.headers.get("content-length");
    const contentRange = res.headers.get("content-range");

    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        "Content-Type": contentType,
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        ...(contentRange ? { "Content-Range": contentRange } : {}),
        "Accept-Ranges": res.headers.get("accept-ranges") || "bytes",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Proxy error", { status: 500 });
  }
}
