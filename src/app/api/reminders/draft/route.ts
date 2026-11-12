import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createReminderDraft,
  getSentReminderCount,
} from "@/lib/db";
import { draftOverdueReminder, ReminderTone } from "@/lib/llm";
import {
  getDaysOverdue,
  getEffectiveToday,
  getInvoiceReminderContext,
  isReminderEligible,
} from "@/lib/reminders";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  invoiceId: z.number().int().positive(),
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
      { success: false, error: "A valid invoice ID is required." },
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
      { success: false, error: "Only unpaid overdue invoices can receive reminders." },
      { status: 409 }
    );
  }

  const reminderCount = getSentReminderCount(invoice.id);
  const tone: ReminderTone =
    reminderCount === 0 ? "friendly" : reminderCount === 1 ? "firm" : "final";
  const daysOverdue = getDaysOverdue(invoice.due_date!, getEffectiveToday());

  try {
    const draft = await draftOverdueReminder({
      sourceText: invoice.source_text,
      amount: Number(invoice.due_amount).toFixed(2),
      daysOverdue,
      tone,
    });
    const reminderId = createReminderDraft({
      invoice_id: invoice.id,
      tone,
      subject: draft.subject,
      body: draft.body,
    });

    return NextResponse.json({
      success: true,
      reminderId,
      tone,
      reminderCount,
      daysOverdue,
      subject: draft.subject,
      body: draft.body,
    });
  } catch (error) {
    console.error("[POST /api/reminders/draft]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Could not draft a reminder.",
      },
      { status: 502 }
    );
  }
}
