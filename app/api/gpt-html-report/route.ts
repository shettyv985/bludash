import { NextRequest, NextResponse } from "next/server";
import { getOpenAIReportModel } from "@/lib/openaiResponses";
import { renderReportHtml } from "@/lib/renderReportHtml";

type HtmlReportMode = "ads" | "social";

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      mode?: HtmlReportMode;
      payload?: unknown;
      reportData?: unknown;
    };

    if (body.mode !== "ads" && body.mode !== "social") {
      throw new Error("Missing or invalid mode");
    }
    if (!body.payload || !body.reportData) {
      throw new Error("Missing payload or reportData");
    }

    return NextResponse.json({
      html: renderReportHtml({
        mode: body.mode,
        payload: body.payload,
        reportData: body.reportData,
        model: getOpenAIReportModel(),
      }),
      model: getOpenAIReportModel(),
    });
  } catch (err: unknown) {
    console.error("gpt-html-report render error:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
