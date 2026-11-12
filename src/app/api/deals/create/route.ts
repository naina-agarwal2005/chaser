import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createDeal,
  markInvoiceSent,
  upsertInvoice,
} from "@/lib/db";
import {
  createDraftInvoice,
  sendInvoice,
  syncInvoiceStatus,
} from "@/lib/paypal";
import { ExtractedDealSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const WrappedCreateRequestSchema = z.object({
  deal: ExtractedDealSchema,
  source_text: z.string().max(50_000).optional().default(""),
});
const DirectCreateRequestSchema = ExtractedDealSchema.extend({
  source_text: z.string().max(50_000).optional().default(""),
}).transform(({ source_text, ...deal }) => ({ deal, source_text }));
const CreateRequestSchema = z.union([
  WrappedCreateRequestSchema,
  DirectCreateRequestSchema,
]);

function isValidDate(value: string | null): boolean {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function nameParts(name: string | null): { givenName?: string; surname?: string } {
  if (!name?.trim()) return {};
  const [givenName, ...rest] = name.trim().split(/\s+/);
  return { givenName, surname: rest.join(" ") || undefined };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsed = CreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid deal data.", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const dealData = parsed.data.deal;
  if (
    !dealData.line_items.length ||
    dealData.line_items.some(
      (item) =>
        !item.description.trim() ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        !Number.isFinite(item.unit_price) ||
        item.unit_price < 0
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Add a description and valid quantity and price for each line item.",
      },
      { status: 400 }
    );
  }

  if (dealData.client_email && !z.string().email().safeParse(dealData.client_email).success) {
    return NextResponse.json(
      { success: false, error: "Enter a valid client email address." },
      { status: 400 }
    );
  }

  if (
    !isValidDate(dealData.deposit?.due_date ?? null) ||
    !isValidDate(dealData.balance?.due_date ?? null)
  ) {
    return NextResponse.json(
      { success: false, error: "Invoice due dates must be valid dates in YYYY-MM-DD format." },
      { status: 400 }
    );
  }

  const totalCents = dealData.line_items.reduce(
    (sum, item) => sum + Math.round(item.unit_price * 100) * item.quantity,
    0
  );
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return NextResponse.json(
      { success: false, error: "The deal total must be a positive, valid USD amount." },
      { status: 400 }
    );
  }

  let depositCents = 0;
  if (dealData.deposit) {
    const { amount, percent } = dealData.deposit;
    if (
      (amount !== null && (!Number.isFinite(amount) || amount <= 0)) ||
      (percent !== null && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) ||
      (amount === null && percent === null)
    ) {
      return NextResponse.json(
        { success: false, error: "Provide a positive deposit amount or a percentage from 1 to 100." },
        { status: 400 }
      );
    }
    depositCents =
      amount !== null
        ? Math.round(amount * 100)
        : Math.round((totalCents * (percent ?? 0)) / 100);
    if (!Number.isSafeInteger(depositCents)) {
      return NextResponse.json(
        { success: false, error: "The deposit amount is outside the supported USD range." },
        { status: 400 }
      );
    }
    if (depositCents <= 0 || depositCents >= totalCents) {
      return NextResponse.json(
        { success: false, error: "The deposit must be less than the total so a balance invoice can be created." },
        { status: 400 }
      );
    }
  }

  const businessEmail = process.env.SANDBOX_BUSINESS_EMAIL;
  const sandboxRecipientEmail = process.env.SANDBOX_PERSONAL_EMAIL;
  if (!businessEmail || !sandboxRecipientEmail) {
    return NextResponse.json(
      {
        success: false,
        error: "Set SANDBOX_BUSINESS_EMAIL and SANDBOX_PERSONAL_EMAIL before creating sandbox invoices.",
      },
      { status: 500 }
    );
  }

  let dealId: number | null = null;
  const createdInvoices: Array<{ kind: "deposit" | "balance"; paypal_invoice_id: string }> = [];
  try {
    const deal = createDeal({
      client_name: dealData.client_name,
      client_email: dealData.client_email,
      source_text: parsed.data.source_text,
      extracted_json: JSON.stringify(dealData),
      total_amount: totalCents / 100,
    });
    dealId = deal.id;

    const invoiceItems: Array<{
      kind: "deposit" | "balance";
      amountCents: number;
      dueDate: string | null;
    }> = [];
    if (depositCents > 0) {
      invoiceItems.push({
        kind: "deposit",
        amountCents: depositCents,
        dueDate: dealData.deposit!.due_date,
      });
    }
    invoiceItems.push({
      kind: "balance",
      amountCents: totalCents - depositCents,
      dueDate: dealData.balance?.due_date ?? null,
    });

    for (const invoiceItem of invoiceItems) {
      const description =
        invoiceItem.kind === "deposit"
          ? `Deposit for ${dealData.line_items.map((item) => item.description).join(", ")}`
          : `Balance for ${dealData.line_items.map((item) => item.description).join(", ")}`;
      const draft = await createDraftInvoice({
        invoicerEmail: businessEmail,
        recipientEmail: sandboxRecipientEmail,
        recipientName: nameParts(dealData.client_name),
        items: [
          {
            name: invoiceItem.kind === "deposit" ? "Project deposit" : "Project balance",
            description,
            quantity: "1",
            unitAmount: { currencyCode: "USD", value: (invoiceItem.amountCents / 100).toFixed(2) },
          },
        ],
        dueDate: invoiceItem.dueDate ?? undefined,
        note: `Chaser ${invoiceItem.kind} invoice`,
      });

      if (!draft.id) {
        throw new Error(`PayPal did not return an ID for the ${invoiceItem.kind} invoice.`);
      }

      upsertInvoice({
        deal_id: deal.id,
        kind: invoiceItem.kind,
        paypal_invoice_id: draft.id,
        invoice_number: draft.detail?.invoice_number ?? null,
        amount: draft.amount?.value ?? (invoiceItem.amountCents / 100).toFixed(2),
        due_amount: draft.due_amount?.value ?? (invoiceItem.amountCents / 100).toFixed(2),
        due_date: draft.detail?.payment_term?.due_date ?? invoiceItem.dueDate,
        status: draft.status ?? "DRAFT",
        paid_amount: "0.00",
        recipient_email: sandboxRecipientEmail,
        recipient_view_url:
          draft.detail?.metadata?.recipient_view_url ??
          draft.links?.find((link) => link.rel === "payer-view")?.href ??
          null,
        created_at: draft.detail?.metadata?.create_time ?? new Date().toISOString(),
      });
      createdInvoices.push({ kind: invoiceItem.kind, paypal_invoice_id: draft.id });

      await sendInvoice(draft.id, { sendToRecipient: true, sendToInvoicer: true });
      markInvoiceSent(draft.id);
      await syncInvoiceStatus(draft.id);
    }

    return NextResponse.json({ success: true, dealId: String(deal.id) });
  } catch (error) {
    console.error("[POST /api/deals/create]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Invoice creation failed.",
        ...(dealId === null ? {} : { dealId: String(dealId), createdInvoices }),
        dealSaved: dealId !== null,
        partial: createdInvoices.length > 0,
      },
      { status: 502 }
    );
  }
}
