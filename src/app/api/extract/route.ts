import { NextResponse } from "next/server";
import { z } from "zod";
import { extractDealFromText } from "@/lib/llm";
import { createDefaultDeal } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const ExtractRequestSchema = z.object({
  text: z.string().trim().min(1).max(50_000),
});

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const parsedBody = ExtractRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: "Provide conversation text no longer than 50,000 characters." },
        { status: 400 }
      );
    }

    const result = await extractDealFromText(parsedBody.data.text);

    if (result.success) {
      return NextResponse.json({ success: true, data: result.data });
    }

    // Graceful fallback: 200 with extraction_error flag so the UI
    // can populate the manual entry form without breaking.
    return NextResponse.json({
      success: false,
      extraction_error: true,
      fallback: result.data,
      error: result.error_message ?? "AI extraction failed.",
    });
  } catch (error) {
    console.error("[POST /api/extract]", error);
    return NextResponse.json(
      {
        success: false,
        extraction_error: true,
        fallback: createDefaultDeal(),
        error: error instanceof Error ? error.message : "Unexpected server error.",
      },
      { status: 500 }
    );
  }
}
