import { NextResponse } from "next/server";
import {
  createDraftInvoice,
  sendInvoice,
  syncInvoiceStatus,
  CreateInvoiceInput,
} from "@/lib/paypal";
import { upsertInvoice } from "@/lib/db";

export async function POST(request: Request) {
  try {
    let customRecipient: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.recipientEmail === "string" && body.recipientEmail.trim()) {
        customRecipient = body.recipientEmail.trim();
      }
    } catch {
      // Empty or non-JSON body
    }

    const businessEmail = process.env.SANDBOX_BUSINESS_EMAIL;
    const personalEmail =
      customRecipient ||
      process.env.SANDBOX_PERSONAL_EMAIL;

    if (!businessEmail || !personalEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing SANDBOX_BUSINESS_EMAIL or SANDBOX_PERSONAL_EMAIL in environment variables.",
        },
        { status: 500 }
      );
    }

    const steps: Array<{ step: string; status: "success" | "error"; detail: string }> = [];

    // 1. Prepare hardcoded sample invoice data
    const invoicePayload: CreateInvoiceInput = {
      invoicerEmail: businessEmail,
      recipientEmail: personalEmail,
      recipientName: {
        givenName: "Jane",
        surname: "Doe",
      },
      recipientAddress: {
        addressLine1: "123 Main Street",
        adminArea2: "San Jose",
        adminArea1: "CA",
        postalCode: "95131",
        countryCode: "US",
      },
      items: [
        {
          name: "Design & Brand Strategy Consultation",
          description: "Initial deposit for sprint 1 milestones (Stage 2 test)",
          quantity: "1",
          unitAmount: {
            currencyCode: "USD",
            value: "150.00",
          },
        },
      ],
      note: "Thank you for your business! USD Sandbox invoice test for Chaser.",
    };

    // 2. Create Draft Invoice
    const draft = await createDraftInvoice(invoicePayload);
    steps.push({
      step: "1. Create Draft Invoice",
      status: "success",
      detail: `Created draft invoice ${draft.id} with status ${draft.status}`,
    });

    // 3. Save row in SQLite DB immediately whenever test creates an invoice (Requirement 2)
    const initialRecord = upsertInvoice({
      paypal_invoice_id: draft.id,
      invoice_number: draft.detail?.invoice_number || null,
      amount: draft.amount?.value || "150.00",
      due_amount: draft.due_amount?.value || draft.amount?.value || "150.00",
      due_date: draft.detail?.payment_term?.due_date || null,
      status: draft.status || "DRAFT",
      paid_amount: "0.00",
      recipient_email: personalEmail,
      recipient_view_url:
        draft.detail?.metadata?.recipient_view_url ||
        draft.links?.find((l) => l.rel === "payer-view")?.href ||
        null,
      created_at: draft.detail?.metadata?.create_time || new Date().toISOString(),
    });

    // 4. Send Invoice (Requirement 1: NO FALLBACK, show real PayPal error)
    let syncedRecord = initialRecord;
    try {
      await sendInvoice(draft.id, {
        sendToRecipient: true,
        sendToInvoicer: true,
      });

      steps.push({
        step: "2. Send Invoice",
        status: "success",
        detail: `Sent invoice ${draft.id} to ${personalEmail}`,
      });

      // 5. Sync live status, paid amount and due amount in DB (Requirement 3)
      syncedRecord = await syncInvoiceStatus(draft.id);

      steps.push({
        step: "3. Fetch & Sync Invoice",
        status: "success",
        detail: `Synced invoice with PayPal. Real status: ${syncedRecord.status}`,
      });
    } catch (sendErr: any) {
      // Real PayPal error - DO NOT fallback to any fake client email
      console.error("PayPal send error:", sendErr);
      return NextResponse.json(
        {
          success: false,
          invoiceId: draft.id,
          savedInDb: true,
          error: sendErr.message || String(sendErr),
          steps,
          invoice: initialRecord,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      invoiceId: syncedRecord.paypal_invoice_id,
      status: syncedRecord.status,
      recipient: syncedRecord.recipient_email,
      invoicer: businessEmail,
      amount: syncedRecord.amount,
      due_amount: syncedRecord.due_amount,
      paid_amount: syncedRecord.paid_amount,
      recipient_view_url: syncedRecord.recipient_view_url,
      steps,
      invoice: syncedRecord,
    });
  } catch (error: any) {
    console.error("Test PayPal Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "An unexpected error occurred during PayPal test.",
      },
      { status: 500 }
    );
  }
}
