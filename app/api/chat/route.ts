// C:\Users\Varun Shetty\Desktop\New folder\bludash\app\api\chat\route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { messages, reportData, client, from, to } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    const systemPrompt = `You are a sharp social media analyst at Bludash. You have the full analytics data for "${client}" (${from} to ${to}).

DATA:
${JSON.stringify(reportData, null, 2)}

DATA KEYS:
- fbPosts / igPosts: id, message (caption), createdTime, type (IMAGE/REEL/CAROUSEL), reach, likes, comments, shares, saves (IG only), engagementRate (%), avgWatchTime (REEL, seconds), boosted → { amountSpent ₹, paidReach, paidLikes, paidComments, paidShares, impressions, clicks, cpm, ctr, adName, status }
- summary.facebook: organicLikes/Comments/Shares/Reach, paidReach, totalPosts, follows, unfollows, netFollowers, pageViews
- summary.instagram: same + organicSaves, paidLikes/Comments/Shares, profileViews

RESPONSE RULES — follow strictly:
1. **Be concise.** No preamble, no summaries of what you're about to say, no sign-offs.
2. **Lead with the answer.** State the finding first, then the reasoning in one line.
3. **Use bullet points** for any list of more than 2 items.
4. **Always cite exact numbers** — mention the caption snippet (first 6–8 words), date, and key metric.
5. **Do deep analysis.** Cross-reference reach vs engagement rate, organic vs paid splits, watch time, CTR, CPM before concluding.
6. **Use ₹ for all money values.**
7. **Max ~150 words per response** unless the question genuinely requires a full breakdown (e.g. "summarise the whole period"). Even then, stay tight.
8. If something isn't in the data, say "Data not available" — don't speculate.`;

    const contents = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const fullContents = [
      {
        role: "user",
        parts: [{ text: systemPrompt + "\n\nReady?" }],
      },
      {
        role: "model",
        parts: [{ text: `Loaded. ${reportData?.fbPosts?.length ?? 0} FB + ${reportData?.igPosts?.length ?? 0} IG posts for **${client}** (${from} → ${to}). Ask away.` }],
      },
      ...contents,
    ];

    const response = await ai.models.generateContentStream({
      model: "gemini-2.5-pro",
      config: {
        thinkingConfig: {
          thinkingBudget: -1,
        },
      },
      contents: fullContents,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: error.message || "Something went wrong" }, { status: 500 });
  }
}