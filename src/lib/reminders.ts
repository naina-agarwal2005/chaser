import { db, getClockOffsetDays } from "@/lib/db";

export interface InvoiceReminderContext {
  id: number;
  paypal_invoice_id: string;
  amount: string;
  due_amount: string;
  due_date: string | null;
  status: string;
  source_text: string;
}

export function getInvoiceReminderContext(invoiceId: number): InvoiceReminderContext | null {
  return (
    (db
      .prepare(
        `SELECT i.id, i.paypal_invoice_id, i.amount, i.due_amount, i.due_date, i.status,
                d.source_text
         FROM invoices i
         JOIN deals d ON d.id = i.deal_id
         WHERE i.id = ?`
      )
      .get(invoiceId) as InvoiceReminderContext | undefined) ?? null
  );
}

export function getEffectiveToday(): string {
  return new Date(Date.now() + getClockOffsetDays() * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function getDaysOverdue(dueDate: string, effectiveToday = getEffectiveToday()): number {
  const due = Date.parse(`${dueDate}T00:00:00.000Z`);
  const today = Date.parse(`${effectiveToday}T00:00:00.000Z`);
  return Math.floor((today - due) / 86_400_000);
}

export function isReminderEligible(invoice: InvoiceReminderContext): boolean {
  const parsedDueDate =
    invoice.due_date && /^\d{4}-\d{2}-\d{2}$/.test(invoice.due_date)
      ? new Date(`${invoice.due_date}T00:00:00.000Z`)
      : null;
  return (
    parsedDueDate !== null &&
    !Number.isNaN(parsedDueDate.getTime()) &&
    parsedDueDate.toISOString().slice(0, 10) === invoice.due_date &&
    invoice.due_date < getEffectiveToday() &&
    Number(invoice.due_amount) > 0 &&
    !["PAID", "MARKED_AS_PAID", "CANCELLED", "REFUNDED", "DRAFT"].includes(
      invoice.status
    )
  );
}
