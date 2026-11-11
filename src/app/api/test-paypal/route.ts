import { NextResponse } from "next/server";
import {
  createDraftInvoice,
  sendInvoice,
  getInvoice,
  CreateInvoiceInput,
} from "@/lib/paypal";

export async function POST(request: Request) {
  try {
    let customRecipient: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.recipientEmail === "string" && body.recipientEmail.trim()) {
        customRecipient = body.recipientEmail.trim();
      }
    } catch {
      // Empty body or not JSON, proceed with default
    }

    const businessEmail = process.env.SANDBOX_BUSINESS_EMAIL;
    const personalEmail = customRecipient || process.env.SANDBOX_PERSONAL_EMAIL || "client.fictional@example.com";

    if (!businessEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing SANDBOX_BUSINESS_EMAIL in .env",
        },
        { status: 500 }
      );
    }

    const steps: Array<{ step: string; status: "success" | "warning" | "error"; detail: string }> = [];

    // 1. Prepare hardcoded sample invoice data
    let recipientToUse = personalEmail;
    let recipientAddress = {
      addressLine1: "123 Market Street",
      adminArea2: "San Francisco",
      adminArea1: "CA",
      postalCode: "94105",
      countryCode: "US",
    };

    const invoicePayload: CreateInvoiceInput = {
      invoicerEmail: businessEmail,
      recipientEmail: recipientToUse,
      recipientName: {
        givenName: "Alex",
        surname: "Rivera",
      },
      recipientAddress,
      items: [
        {
          name: "Design & Brand Strategy Consultation",
          description: "Initial deposit for sprint 1 milestones (Stage 1 test)",
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
    let draft = await createDraftInvoice(invoicePayload);
    steps.push({
      step: "1. Create Draft Invoice",
      status: "success",
      detail: `Created draft invoice ${draft.id} with status ${draft.status}`,
    });

    // 3. Send Invoice
    let invoiceId = draft.id;
    try {
      await sendInvoice(invoiceId, {
        sendToRecipient: true,
        sendToInvoicer: true,
      });
      steps.push({
        step: "2. Send Invoice",
        status: "success",
        detail: `Sent invoice ${invoiceId} to ${recipientToUse}`,
      });
    } catch (sendErr: any) {
      const errMsg = sendErr?.message || String(sendErr);

      // Handle India domestic foreign-currency block (RBI regulatory restriction)
      // If the sandbox personal account is in India, PayPal forbids sending USD invoices domestically.
      if (errMsg.includes("INR_FOREIGN_CURRENCY_BLOCKED")) {
        steps.push({
          step: "2. Send Invoice (Sandbox Restriction)",
          status: "warning",
          detail: `Recipient ${recipientToUse} is registered in India. PayPal RBI regulations block domestic USD invoicing. Retrying with international fictional client as specified in SPEC.md...`,
        });

        // Recreate draft with international fictional client
        recipientToUse = "client.alex.rivera@example.com";
        invoicePayload.recipientEmail = recipientToUse;
        draft = await createDraftInvoice(invoicePayload);
        invoiceId = draft.id;

        await sendInvoice(invoiceId, {
          sendToRecipient: true,
          sendToInvoicer: true,
        });

        steps.push({
          step: "2. Send Invoice (International)",
          status: "success",
          detail: `Sent invoice ${invoiceId} to international client ${recipientToUse}`,
        });
      } else {
        throw sendErr;
      }
    }

    // 4. Fetch Invoice Details
    const fetchedInvoice = await getInvoice(invoiceId);
    steps.push({
      step: "3. Fetch Invoice",
      status: "success",
      detail: `Fetched live invoice ${invoiceId}. Real status: ${fetchedInvoice.status}`,
    });

    return NextResponse.json({
      success: true,
      invoiceId,
      status: fetchedInvoice.status,
      recipient: recipientToUse,
      invoicer: businessEmail,
      amount: fetchedInvoice.amount || {
        currency_code: "USD",
        value: "150.00",
      },
      detail: fetchedInvoice.detail,
      steps,
      invoice: fetchedInvoice,
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
