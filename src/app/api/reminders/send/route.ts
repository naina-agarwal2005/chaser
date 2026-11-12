import { NextResponse } from "next/server";
import { z } from "zod";
import { db, markReminderSent, updateReminderDraft } from "@/lib/db";
import { sendInvoiceReminder } from "@/lib/paypal";
import {
  getInvoiceReminderContext,
  isReminderEligible,
} from "@/lib/reminders";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  invoiceId: z.number().int().positive(),
  reminderId: z.number().int().positive(),
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
});

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

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Provide an invoice, reminder, subject, and body." },
      { status: 400 }
    );
  }

  const invoice = getInvoiceReminderContext(parsed.data.invoiceId);
  if (!invoice) {
    return NextResponse.json(
      { success: false, error: "Invoice or linked deal was not found." },
      { status: 404 }
    );
  }
  if (!isReminderEligible(invoice)) {
    return NextResponse.json(
      { success: false, error: "This invoice is no longer overdue and unpaid." },
      { status: 409 }
    );
  }

  const reminder = db
    .prepare("SELECT id, invoice_id, status FROM reminders WHERE id = ?")
    .get(parsed.data.reminderId) as
    | { id: number; invoice_id: number; status: string }
    | undefined;
  if (
    !reminder ||
    reminder.invoice_id !== invoice.id ||
    reminder.status !== "draft"
  ) {
    return NextResponse.json(
      { success: false, error: "This reminder draft is not available to send." },
      { status: 409 }
    );
  }

  if (
    !updateReminderDraft({
      id: reminder.id,
      invoice_id: invoice.id,
      subject: parsed.data.subject,
      body: parsed.data.body,
    })
  ) {
    return NextResponse.json(
      { success: false, error: "This reminder draft has already been updated or sent." },
      { status: 409 }
    );
  }

  try {
    await sendInvoiceReminder(invoice.paypal_invoice_id, {
      subject: parsed.data.subject,
      note: parsed.data.body,
    });
    markReminderSent(reminder.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/reminders/send]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Could not send reminder via PayPal.",
      },
      { status: 502 }
    );
  }
}
