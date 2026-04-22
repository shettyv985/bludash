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

    // Build the system prompt with all the report data as knowledge base
    const systemPrompt = `You are an expert social media analyst and creative strategist working for Bludash, a social media marketing agency. You have been given the complete analytics data for the client "${client}" for the period ${from} to ${to}.

Here is the complete data as your knowledge base:

${JSON.stringify(reportData, null, 2)}

DATA STRUCTURE EXPLANATION:
- fbPosts: Array of Facebook posts with fields: id, message (caption), createdTime, type (IMAGE/REEL/CAROUSEL), reach, likes, comments, shares, engagementRate (%), boosted (if present: amountSpent in INR, paidReach, paidLikes, paidComments, paidShares, impressions, clicks, cpm, ctr, adName, status)
- igPosts: Array of Instagram posts with same fields plus: saves, avgWatchTime (for REELs in seconds)
- summary.facebook: Aggregated FB totals (organicLikes, organicComments, organicShares, organicReach, paidReach, totalPosts, follows, unfollows, netFollowers, pageViews)
- summary.instagram: Aggregated IG totals (organicLikes, organicComments, organicShares, organicSaves, organicReach, paidLikes, paidComments, paidShares, paidReach, totalPosts, follows, unfollows, netFollowers, profileViews)

YOUR CAPABILITIES:
- Identify best and worst performing creatives with specific reasoning based on engagement rate, reach, likes, comments, shares, saves
- Compare organic vs paid performance
- Spot trends across the reporting period
- Analyze boosted post ROI (cost per engagement, CPM, CTR)
- Give actionable recommendations
- Answer any question about the data

RESPONSE STYLE:
- Be specific — always mention the actual caption snippet, date, and numbers
- When identifying best/worst, explain the exact reason (e.g. "low engagement rate of 0.8% despite high reach of 12,000 suggests the creative didn't resonate")
- Use ₹ for currency amounts
- Keep responses concise but insightful
- If asked about something not in the data, say so honestly
- Format with clear sections when comparing multiple posts`;

    // Convert messages to Gemini format
    const contents = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Add system context as first user message if it's the first real message
    const fullContents = [
      {
        role: "user",
        parts: [{ text: systemPrompt + "\n\nI am ready to answer questions about this data." }],
      },
      {
        role: "model",
        parts: [{ text: `Got it! I've loaded the complete analytics data for **${client}** (${from} to ${to}). I can see all the Facebook and Instagram posts, their engagement metrics, boosted post details, audience data, and more. What would you like to know?` }],
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

    // Stream the response
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