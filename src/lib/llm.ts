/**
 * All LLM calls go through this module.
 * Uses Groq's OpenAI-compatible chat completions API.
 */
import { z } from "zod";
import {
  ExtractedDealSchema,
  ExtractedDeal,
  createDefaultDeal,
} from "./schemas";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";
const MAX_TOKENS = 8192;
const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = new Set([429, 503]);
const ReminderDraftSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
});

export type ReminderTone = "friendly" | "firm" | "final";

export interface ReminderDraft {
  subject: string;
  body: string;
}

export interface ExtractionResult {
  success: boolean;
  data: ExtractedDeal;
  extraction_error?: boolean;
  error_message?: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

/** Strips optional markdown code fences in case a model ignores the JSON-only prompt. */
function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeExtractedDeal(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Groq returned JSON that is not a deal object.");
  }

  const raw = value as Record<string, unknown>;
  const fallback = createDefaultDeal();
  const ambiguities: Array<{ field: string; question: string }> = [];
  const addAmbiguity = (field: string, question: string) => {
    if (!ambiguities.some((ambiguity) => ambiguity.field === field)) {
      ambiguities.push({ field, question });
    }
  };

  if (Array.isArray(raw.ambiguities)) {
    for (let index = 0; index < raw.ambiguities.length; index += 1) {
      const item = raw.ambiguities[index];
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        addAmbiguity(
          `ambiguities.${index}`,
          "Please review this deal detail; the AI could not provide a complete clarification."
        );
        continue;
      }

      const ambiguity = item as Record<string, unknown>;
      const field =
        typeof ambiguity.field === "string" && ambiguity.field.trim()
          ? ambiguity.field.trim()
          : `field ${index + 1}`;
      const question =
        typeof ambiguity.question === "string" && ambiguity.question.trim()
          ? ambiguity.question.trim()
          : "Please review this detail; the AI did not provide a clarification question.";
      addAmbiguity(field, question);
    }
  }

  let lineItems: unknown[];
  if (Array.isArray(raw.line_items) && raw.line_items.length > 0) {
    lineItems = raw.line_items.map((item, index) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        addAmbiguity(
          `line_items.${index + 1}`,
          "Add or correct this line item; the AI could not extract its details."
        );
        return fallback.line_items[0];
      }

      const lineItem = item as Record<string, unknown>;
      if (
        typeof lineItem.description !== "string" ||
        typeof lineItem.quantity !== "number" ||
        typeof lineItem.unit_price !== "number"
      ) {
        addAmbiguity(
          `line_items.${index + 1}`,
          "Confirm the description, quantity, and unit price for this line item."
        );
      }

      return {
        description:
          typeof lineItem.description === "string" ? lineItem.description : "",
        quantity:
          typeof lineItem.quantity === "number" ? lineItem.quantity : 1,
        unit_price:
          typeof lineItem.unit_price === "number" ? lineItem.unit_price : 0,
        source_quote:
          typeof lineItem.source_quote === "string" ? lineItem.source_quote : "",
      };
    });
  } else {
    lineItems = fallback.line_items;
    addAmbiguity(
      "line_items",
      "Add at least one line item with its description, quantity, and unit price."
    );
  }

  let deposit: unknown = null;
  if (typeof raw.deposit === "object" && raw.deposit !== null && !Array.isArray(raw.deposit)) {
    const rawDeposit = raw.deposit as Record<string, unknown>;
    if (
      !("amount" in rawDeposit) ||
      !("percent" in rawDeposit) ||
      !("due_date" in rawDeposit) ||
      typeof rawDeposit.source_quote !== "string"
    ) {
      addAmbiguity(
        "deposit",
        "Confirm the deposit amount or percentage and its due date."
      );
    }
    deposit = {
      amount: typeof rawDeposit.amount === "number" ? rawDeposit.amount : null,
      percent: typeof rawDeposit.percent === "number" ? rawDeposit.percent : null,
      due_date: typeof rawDeposit.due_date === "string" ? rawDeposit.due_date : null,
      source_quote:
        typeof rawDeposit.source_quote === "string" ? rawDeposit.source_quote : "",
    };
  } else if (!("deposit" in raw)) {
    addAmbiguity(
      "deposit",
      "Confirm whether this deal requires a deposit; none was extracted."
    );
  }

  let balance: unknown = null;
  if (typeof raw.balance === "object" && raw.balance !== null && !Array.isArray(raw.balance)) {
    const rawBalance = raw.balance as Record<string, unknown>;
    if (!("due_date" in rawBalance) || typeof rawBalance.source_quote !== "string") {
      addAmbiguity("balance", "Confirm the balance invoice due date.");
    }
    balance = {
      due_date: typeof rawBalance.due_date === "string" ? rawBalance.due_date : null,
      source_quote:
        typeof rawBalance.source_quote === "string" ? rawBalance.source_quote : "",
    };
  } else if (!("balance" in raw)) {
    addAmbiguity("balance", "Confirm the balance invoice due date.");
  }

  if (typeof raw.client_name !== "string" && raw.client_name !== null) {
    addAmbiguity("client_name", "Enter the client's name if it was not identified.");
  }
  if (typeof raw.client_email !== "string" && raw.client_email !== null) {
    addAmbiguity("client_email", "Enter the client's email if it was not identified.");
  }

  return {
    client_name: typeof raw.client_name === "string" ? raw.client_name : null,
    client_email: typeof raw.client_email === "string" ? raw.client_email : null,
    currency: raw.currency ?? "USD",
    line_items: lineItems,
    deposit,
    balance,
    ambiguities,
    overall_confidence:
      raw.overall_confidence === "high" ||
      raw.overall_confidence === "medium" ||
      raw.overall_confidence === "low"
        ? raw.overall_confidence
        : "low",
  };
}

function getModels(): string[] {
  return (process.env.LLM_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function completeWithModels(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("LLM_API_KEY is not set. Add your Groq API key to the server environment.");
  }

  const models = getModels();
  if (models.length === 0) {
    throw new Error("LLM_MODELS is empty. Set a comma-separated list of Groq model IDs.");
  }

  const failures: string[] = [];

  for (const model of models) {
    let modelFailed = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: MAX_TOKENS,
          }),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Network request failed.";
        failures.push(`${model}: ${detail}`);
        modelFailed = true;
        break;
      }

      if (RETRYABLE_STATUSES.has(response.status)) {
        const detail = await response.text();
        if (attempt < MAX_RETRIES) {
          await delay(1000 * 2 ** attempt);
          continue;
        }
        failures.push(`${model}: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`);
        modelFailed = true;
        break;
      }

      if (!response.ok) {
        const detail = await response.text();
        failures.push(`${model}: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`);
        modelFailed = true;
        break;
      }

      let completion: ChatCompletionResponse;
      try {
        completion = (await response.json()) as ChatCompletionResponse;
      } catch {
        failures.push(`${model}: Groq returned an invalid response body.`);
        modelFailed = true;
        break;
      }

      const content = completion.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        failures.push(`${model}: Groq returned an empty completion.`);
        modelFailed = true;
        break;
      }

      console.info(`[llm.ts] Groq request succeeded with model "${model}".`);
      return content;
    }

    if (!modelFailed) {
      failures.push(`${model}: request failed without a response.`);
    }
  }

  throw new Error(`All configured Groq models failed. ${failures.join(" | ")}`);
}

/**
 * Extracts structured deal details from a raw client conversation.
 * Validates output with Zod – never trusts LLM output without schema check.
 */
export async function extractDealFromText(rawText: string): Promise<ExtractionResult> {
  if (!process.env.LLM_API_KEY) {
    return {
      success: false,
      data: createDefaultDeal(),
      extraction_error: true,
      error_message: "LLM_API_KEY is not set. Manual entry form is ready below.",
    };
  }

  const currentDate = new Date().toISOString().split("T")[0];
  const systemInstruction = `You are an AI extraction assistant for "Chaser", a freelancer invoicing tool.
Read the messy client conversation and return JSON only, matching the required deal schema.

TODAY'S DATE: ${currentDate}

RULES:
1. Return only a JSON object; do not include prose or markdown code fences.
2. Never invent values. If a field is unclear or missing, use null and add an ambiguity entry.
3. Resolve relative dates ("next Friday", "in 5 days", "by the 20th") against today (${currentDate}) and output as YYYY-MM-DD.
4. "On delivery", "when finished", or "upon completion" with no fixed date means due_date: null and an ambiguity entry.
5. source_quote must be an exact verbatim snippet from the input text, not a paraphrase.
6. currency is always "USD".
7. Include every required schema field.
8. When the conversation gives one combined price for a project or package, create one line_items entry using that description, quantity 1, and the full combined unit_price. Do not omit a package price or split it into unpriced components.
9. Deposit and balance amounts are payment terms, not additional line items.`;

  try {
    const rawResponse = await completeWithModels(systemInstruction, rawText);
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(rawResponse));
    } catch {
      throw new Error("Could not parse Groq response as JSON.");
    }

    const result = ExtractedDealSchema.safeParse(normalizeExtractedDeal(parsed));
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
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

export async function draftOverdueReminder(input: {
  sourceText: string;
  amount: string;
  daysOverdue: number;
  tone: ReminderTone;
}): Promise<ReminderDraft> {
  const systemPrompt =
    "You draft payment reminders for a freelancer invoicing tool. Never include a greeting name unless it appears in the source conversation. Return JSON only with subject and body strings.";
  const userPrompt = `Write a concise, professional invoice payment reminder.
Return a JSON object only with the fields "subject" and "body". Do not add prose or markdown code fences.

Escalation tone: ${input.tone}
Outstanding amount: USD ${input.amount}
Days overdue: ${input.daysOverdue}
Original client conversation:
${input.sourceText || "(No source conversation was saved.)"}

Keep the message respectful and factual. Do not invent dates, invoice numbers, late fees, payment methods, or legal consequences. Do not claim a payment is overdue by more days than specified.`;

  const rawResponse = await completeWithModels(systemPrompt, userPrompt);
  let value: unknown;
  try {
    value = JSON.parse(stripCodeFences(rawResponse));
  } catch {
    throw new Error("Groq returned an invalid reminder draft.");
  }

  const parsed = ReminderDraftSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Groq reminder draft did not match the required format: ${details}`);
  }

  return parsed.data;
}
