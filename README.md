# Chaser

Paste a client conversation, review extracted deal terms, create PayPal Sandbox
deposit and balance invoices, and track their payment status.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set:
   - `GEMINI_API_KEY` for deal extraction with Gemini 3.8 Flash.
   - `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET` for PayPal Sandbox API access.
   - `SANDBOX_BUSINESS_EMAIL` and `SANDBOX_PERSONAL_EMAIL` for the Sandbox
     business and recipient accounts.
3. Run `npm run dev`, then open `http://localhost:3000`.

The app stores deals, invoices, and the demo clock offset in `chaser.db`.
Existing Stage 2 invoice rows are retained and receive nullable deal-link
columns when the app starts.

## Demo flow

1. Choose **New Deal**, paste a conversation or select a sample chat, and click
   **Extract with AI**. If Gemini is unavailable, the form opens in manual mode.
2. Review and edit the details, then click **Confirm & Create PayPal Invoices**.
   The app creates and sends a deposit invoice when a deposit is specified,
   followed by a balance invoice, both in PayPal Sandbox.
3. Use **Refresh All Statuses** on the dashboard to fetch current invoice
   statuses from PayPal. **Simulate +7 Days (Overdue)** advances only the app's
   overdue calculation; it does not change PayPal or stored invoice status.

Invoices are always sent to `SANDBOX_PERSONAL_EMAIL`; the client details entered
in the deal are retained separately.
