import { NextResponse } from "next/server";
import { db, getAllDeals, getClockOffsetDays } from "@/lib/db";
import type { InvoiceRecord } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const deals = getAllDeals();
    const invoicesByDeal = new Map<number, InvoiceRecord[]>();
    const allInvoices = db
      .prepare("SELECT * FROM invoices ORDER BY id DESC")
      .all() as InvoiceRecord[];
    for (const invoice of allInvoices) {
      if (invoice.deal_id === null || invoice.deal_id === undefined) continue;
      const current = invoicesByDeal.get(invoice.deal_id) ?? [];
      current.push(invoice);
      invoicesByDeal.set(invoice.deal_id, current);
    }

    const clockOffsetDays = getClockOffsetDays();
    const today = new Date(Date.now() + clockOffsetDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const activeDeals = deals.map((deal) => {
      const dealInvoices = invoicesByDeal.get(deal.id) ?? [];
      const hasPayment = dealInvoices.some((invoice) => Number(invoice.paid_amount) > 0);
      const allPaid =
        dealInvoices.length > 0 &&
        dealInvoices.every((invoice) => invoice.status === "PAID");
      const status = allPaid ? "PAID" : hasPayment ? "PARTIALLY_PAID" : "UNPAID";
      return {
        id: deal.id,
        client_name: deal.client_name,
        client_email: deal.client_email,
        source_text: deal.source_text,
        total_amount: deal.total_amount,
        created_at: deal.created_at,
        status,
        invoices: dealInvoices.map((invoice) => ({
          id: invoice.id,
          kind: invoice.kind,
          amount: invoice.amount,
          due_amount: invoice.due_amount,
          paid_amount: invoice.paid_amount,
          due_date: invoice.due_date,
          status: invoice.status,
          recipient_view_url: invoice.recipient_view_url,
          paypal_invoice_id: invoice.paypal_invoice_id,
        })),
      };
    });

    const outstanding = allInvoices.filter(
      (invoice) => !["PAID", "CANCELLED", "REFUNDED", "DRAFT"].includes(invoice.status)
    );
    const totalOwed = outstanding.reduce(
      (sum, invoice) => sum + Number(invoice.due_amount || 0),
      0
    );
    const totalOverdue = outstanding
      .filter((invoice) => invoice.due_date !== null && invoice.due_date < today)
      .reduce((sum, invoice) => sum + Number(invoice.due_amount || 0), 0);
    const totalPaid = allInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.paid_amount || 0),
      0
    );

    return NextResponse.json({
      success: true,
      metrics: {
        totalOwed: totalOwed.toFixed(2),
        totalOverdue: totalOverdue.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
      },
      deals: activeDeals,
      clockOffsetDays,
      today,
    });
  } catch (error) {
    console.error("[GET /api/dashboard]", error);
    return NextResponse.json(
      { success: false, error: "Could not load dashboard data." },
      { status: 500 }
    );
  }
}
