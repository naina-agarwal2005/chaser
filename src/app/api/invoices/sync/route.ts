import { NextResponse } from "next/server";
import { syncInvoiceStatus } from "@/lib/paypal";
import { getAllInvoices, getUnfinishedInvoices } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    // Case 1: Sync a single invoice by ID (or Import a new one by pasting ID)
    if (body.invoiceId && typeof body.invoiceId === "string") {
      const invoiceId = body.invoiceId.trim();
      if (!invoiceId) {
        return NextResponse.json(
          { success: false, error: "Please provide a valid invoice ID." },
          { status: 400 }
        );
      }

      const updatedRecord = await syncInvoiceStatus(invoiceId);
      return NextResponse.json({
        success: true,
        invoice: updatedRecord,
        allInvoices: getAllInvoices(),
      });
    }

    // Case 2: Sync all active/unpaid invoices (30-second poll or manual refresh all)
    if (body.syncAllUnpaid) {
      const pendingInvoices = getUnfinishedInvoices();
      const results: Array<{ id: string; status: string; error?: string }> = [];

      for (const inv of pendingInvoices) {
        try {
          const synced = await syncInvoiceStatus(inv.paypal_invoice_id);
          results.push({ id: synced.paypal_invoice_id, status: synced.status });
        } catch (err: any) {
          results.push({
            id: inv.paypal_invoice_id,
            status: inv.status,
            error: err.message,
          });
        }
      }

      return NextResponse.json({
        success: true,
        syncedCount: results.length,
        results,
        invoices: getAllInvoices(),
      });
    }

    return NextResponse.json(
      { success: false, error: "Missing invoiceId or syncAllUnpaid flag." },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Sync API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to sync invoice with PayPal.",
      },
      { status: 500 }
    );
  }
}
