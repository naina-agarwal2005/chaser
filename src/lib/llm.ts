/**
 * src/lib/llm.ts
 * All LLM calls go through this module (workspace rule).
 * Uses @google/genai with GEMINI_API_KEY.
 */
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedDealSchema, ExtractedDeal, createDefaultDeal } from "./schemas";

export interface ExtractionResult {
  success: boolean;
  data: ExtractedDeal;
  extraction_error?: boolean;
  error_message?: string;
}

/** Strips optional markdown code fences in case model ignores responseMimeType */
function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Extracts structured deal details from a raw client conversation.
 * Validates output with Zod – never trusts LLM output without schema check.
 */
export async function extractDealFromText(rawText: string): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      data: createDefaultDeal(),
      extraction_error: true,
      error_message: "GEMINI_API_KEY is not set. Manual entry form is ready below.",
    };
  }

  const currentDate = new Date().toISOString().split("T")[0];

  const systemInstruction = `You are an AI extraction assistant for "Chaser", a freelancer invoicing tool.
Your task: read a messy client conversation and extract deal terms as strict JSON.

TODAY'S DATE: ${currentDate}

RULES:
1. Output ONLY the JSON object – no prose, no markdown code blocks.
2. Never invent values. If any field is unclear or missing, use null and add an ambiguity entry.
3. Resolve relative dates ("next Friday", "in 5 days", "by the 20th") against today (${currentDate}) and output as YYYY-MM-DD.
4. "On delivery", "when finished", "upon completion" with no fixed date → due_date: null + ambiguity entry.
5. source_quote must be an exact verbatim snippet from the input text (no paraphrasing).
6. currency is always "USD".`;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [{ role: "user", parts: [{ text: rawText }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            client_name: { type: Type.STRING, nullable: true },
            client_email: { type: Type.STRING, nullable: true },
            currency: { type: Type.STRING, enum: ["USD"] },
            line_items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unit_price: { type: Type.NUMBER },
                  source_quote: { type: Type.STRING },
                },
                required: ["description", "quantity", "unit_price", "source_quote"],
              },
            },
            deposit: {
              type: Type.OBJECT,
              nullable: true,
              properties: {
                amount: { type: Type.NUMBER, nullable: true },
                percent: { type: Type.NUMBER, nullable: true },
                due_date: { type: Type.STRING, nullable: true },
                source_quote: { type: Type.STRING },
              },
              required: ["amount", "percent", "due_date", "source_quote"],
            },
            balance: {
              type: Type.OBJECT,
              nullable: true,
              properties: {
                due_date: { type: Type.STRING, nullable: true },
                source_quote: { type: Type.STRING },
              },
              required: ["due_date", "source_quote"],
            },
            ambiguities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  field: { type: Type.STRING },
                  question: { type: Type.STRING },
                },
                required: ["field", "question"],
              },
            },
            overall_confidence: {
              type: Type.STRING,
              enum: ["high", "medium", "low"],
            },
          },
          required: [
            "client_name",
            "client_email",
            "currency",
            "line_items",
            "deposit",
            "balance",
            "ambiguities",
            "overall_confidence",
          ],
        },
      },
    });

    const rawResponse = response.text;
    if (!rawResponse) {
      throw new Error("Gemini API returned an empty response.");
    }

    // Parse JSON (may already be clean because of responseMimeType)
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(rawResponse));
    } catch {
      throw new Error("Could not parse Gemini response as JSON.");
    }

    // Validate strictly with Zod (workspace rule: never create a deal from unvalidated data)
    const result = ExtractedDealSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Zod validation failed: ${issues}`);
    }

    return { success: true, data: result.data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred during AI extraction.";
    console.error("[llm.ts] extractDealFromText error:", message);

    return {
      success: false,
      data: createDefaultDeal(),
      extraction_error: true,
      error_message: message,
    };
  }
}
