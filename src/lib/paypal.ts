/**
 * PayPal Invoicing API v2 Client for Sandbox
 * Stack: Next.js (TypeScript), PayPal sandbox only, USD only.
 * All PayPal calls go through src/lib/paypal.ts.
 */

const PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";

interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

let cachedToken: CachedToken | null = null;

/**
 * Reset token cache (useful for testing or recovering from 401s)
 */
export function clearPayPalTokenCache(): void {
  cachedToken = null;
}

/**
 * Get PayPal OAuth2 client credentials token with in-memory caching.
 * Caches until 60 seconds before expiry.
 */
export async function getPayPalAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing PAYPAL_CLIENT_ID or PAYPAL_SECRET in environment variables. Check .env file."
    );
  }

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authString}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to obtain PayPal access token (${response.status} ${response.statusText}): ${errorBody}`
    );
  }

  const data = await response.json();
  const expiresInSeconds = typeof data.expires_in === "number" ? data.expires_in : 32400;

  cachedToken = {
    token: data.access_token,
    expiresAt: now + expiresInSeconds * 1000,
  };

  return cachedToken.token;
}

export interface BillingAddress {
  addressLine1?: string;
  addressLine2?: string;
  adminArea2?: string;
  adminArea1?: string;
  postalCode?: string;
  countryCode?: string; // e.g. "US"
}

export interface InvoiceItemInput {
  name: string;
  description?: string;
  quantity: string;
  unitAmount: {
    currencyCode?: string; // USD only
    value: string; // 2 decimal places e.g. "150.00"
  };
}

export interface CreateInvoiceInput {
  invoicerEmail?: string;
  recipientEmail: string;
  recipientName?: {
    givenName?: string;
    surname?: string;
  };
  recipientAddress?: BillingAddress;
  items: InvoiceItemInput[];
  dueDate?: string; // YYYY-MM-DD
  invoiceNumber?: string;
  note?: string;
}

export interface PayPalInvoiceResponse {
  id: string;
  status: string;
  detail?: {
    invoice_number?: string;
    invoice_date?: string;
    currency_code?: string;
    note?: string;
    payment_term?: {
      term_type?: string;
      due_date?: string;
    };
    metadata?: {
      create_time?: string;
      recipient_view_url?: string;
      invoicer_view_url?: string;
    };
  };
  invoicer?: {
    email_address?: string;
    name?: {
      given_name?: string;
      surname?: string;
    };
  };
  primary_recipients?: Array<{
    billing_info?: {
      email_address?: string;
      name?: {
        given_name?: string;
        surname?: string;
      };
      address?: {
        address_line_1?: string;
        address_line_2?: string;
        admin_area_2?: string;
        admin_area_1?: string;
        postal_code?: string;
        country_code?: string;
      };
    };
  }>;
  items?: Array<{
    name: string;
    description?: string;
    quantity: string;
    unit_amount: {
      currency_code: string;
      value: string;
    };
  }>;
  amount?: {
    currency_code: string;
    value: string;
    breakdown?: Record<string, unknown>;
  };
  due_amount?: {
    currency_code: string;
    value: string;
  };
  links?: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
  [key: string]: unknown;
}

/**
 * Creates a draft invoice in PayPal Sandbox via POST /v2/invoicing/invoices
 */
export async function createDraftInvoice(
  input: CreateInvoiceInput
): Promise<PayPalInvoiceResponse> {
  const token = await getPayPalAccessToken();

  const invoicerEmail =
    input.invoicerEmail ||
    process.env.SANDBOX_BUSINESS_EMAIL;

  if (!invoicerEmail) {
    throw new Error(
      "Missing invoicer email. Set SANDBOX_BUSINESS_EMAIL in .env or provide invoicerEmail."
    );
  }

  // Format line items with two decimals for unit_amount.value
  const formattedItems = input.items.map((item) => {
    const numericVal = parseFloat(item.unitAmount.value);
    const formattedValue = isNaN(numericVal)
      ? item.unitAmount.value
      : numericVal.toFixed(2);

    return {
      name: item.name,
      description: item.description,
      quantity: item.quantity || "1",
      unit_amount: {
        currency_code: "USD",
        value: formattedValue,
      },
    };
  });

  const detail: Record<string, unknown> = {
    currency_code: "USD",
    invoice_date: new Date().toISOString().split("T")[0],
  };

  if (input.invoiceNumber) {
    detail.invoice_number = input.invoiceNumber;
  }

  if (input.dueDate) {
    detail.payment_term = {
      term_type: "DUE_ON_DATE_SPECIFIED",
      due_date: input.dueDate,
    };
  } else {
    detail.payment_term = {
      term_type: "DUE_ON_RECEIPT",
    };
  }

  if (input.note) {
    detail.note = input.note;
  }

  const recipientBillingInfo: Record<string, unknown> = {
    email_address: input.recipientEmail,
  };

  if (input.recipientName?.givenName || input.recipientName?.surname) {
    recipientBillingInfo.name = {
      given_name: input.recipientName?.givenName,
      surname: input.recipientName?.surname,
    };
  }

  if (input.recipientAddress) {
    recipientBillingInfo.address = {
      address_line_1: input.recipientAddress.addressLine1,
      address_line_2: input.recipientAddress.addressLine2,
      admin_area_2: input.recipientAddress.adminArea2,
      admin_area_1: input.recipientAddress.adminArea1,
      postal_code: input.recipientAddress.postalCode,
      country_code: input.recipientAddress.countryCode || "US",
    };
  }

  const payload = {
    detail,
    invoicer: {
      email_address: invoicerEmail,
    },
    primary_recipients: [
      {
        billing_info: recipientBillingInfo,
      },
    ],
    items: formattedItems,
  };

  const response = await fetch(`${PAYPAL_API_BASE}/v2/invoicing/invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to create draft invoice (${response.status} ${response.statusText}): ${errorBody}`
    );
  }

  const data = await response.json();

  if (!data.id && data.href) {
    const match = data.href.match(/invoices\/([^/?]+)/);
    if (match) {
      data.id = match[1];
    }
  }

  return data as PayPalInvoiceResponse;
}

export interface SendInvoiceOptions {
  sendToRecipient?: boolean;
  sendToInvoicer?: boolean;
}

/**
 * Sends a draft invoice via POST /v2/invoicing/invoices/{id}/send
 */
export async function sendInvoice(
  invoiceId: string,
  options?: SendInvoiceOptions
): Promise<{ success: boolean; data?: unknown }> {
  const token = await getPayPalAccessToken();

  const response = await fetch(
    `${PAYPAL_API_BASE}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        send_to_recipient: options?.sendToRecipient ?? true,
        send_to_invoicer: options?.sendToInvoicer ?? true,
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to send invoice ${invoiceId} (${response.status} ${response.statusText}): ${errorBody}`
    );
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { success: true, data };
}

/**
 * Fetches an invoice by ID via GET /v2/invoicing/invoices/{id}
 */
export async function getInvoice(
  invoiceId: string
): Promise<PayPalInvoiceResponse> {
  const token = await getPayPalAccessToken();

  const response = await fetch(
    `${PAYPAL_API_BASE}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to get invoice ${invoiceId} (${response.status} ${response.statusText}): ${errorBody}`
    );
  }

  const data = await response.json();
  return data as PayPalInvoiceResponse;
}
