import { z } from "zod";

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().int().positive().default(1),
  unit_price: z.number().finite().nonnegative(),
  source_quote: z
    .string()
    .describe("Exact quote from raw text supporting this line item"),
});

export const ExtractedDealSchema = z.object({
  client_name: z.string().nullable(),
  client_email: z.string().nullable(),
  currency: z.literal("USD").default("USD"),
  line_items: z.array(LineItemSchema).min(1),
  deposit: z
    .object({
      amount: z.number().nullable(),
      percent: z.number().nullable(),
      due_date: z
        .string()
        .nullable()
        .describe("ISO format YYYY-MM-DD or null"),
      source_quote: z.string(),
    })
    .nullable(),
  balance: z
    .object({
      due_date: z
        .string()
        .nullable()
        .describe("ISO format YYYY-MM-DD or null"),
      source_quote: z.string(),
    })
    .nullable(),
  ambiguities: z.array(
    z.object({
      field: z.string(),
      question: z.string(),
    })
  ),
  overall_confidence: z.enum(["high", "medium", "low"]),
});

export type ExtractedDeal = z.infer<typeof ExtractedDealSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;

/** Used when extraction fails – UI falls back to fully manual entry. */
export function createDefaultDeal(): ExtractedDeal {
  return {
    client_name: null,
    client_email: null,
    currency: "USD",
    line_items: [{ description: "", quantity: 1, unit_price: 0, source_quote: "" }],
    deposit: null,
    balance: null,
    ambiguities: [],
    overall_confidence: "low",
  };
}
