You are building "Chaser" in this workspace. Always read SPEC.md before starting any task.

- Stack: Next.js (TypeScript), Tailwind, better-sqlite3, zod. PayPal sandbox only, USD only.
- Work only on the stage I name. Do not build ahead.
- Validate every LLM output with zod. Never create a PayPal invoice from unvalidated data.
- All LLM calls go through src/lib/llm.ts. All PayPal calls go through src/lib/paypal.ts.
- Never hardcode secrets. Use .env and keep .env.example updated.
- No real brand names or logos. Fictional clients only.
- Before saying a stage is done, run it and show me the exact steps and expected result so I can test it.
- If unsure about a PayPal field or endpoint, say so and check the official PayPal docs instead of guessing.
- Keep the UI minimal, with loading, empty, and error states.

# Chaser: spec

## One-liner

Paste a messy client chat, get PayPal invoices, track payment live, and get AI-drafted reminders when a client pays late.

## Users

Solo freelancers billing clients, often abroad: designers, developers, tutors, photographers, writers.
Deals are agreed informally (email, Slack, WhatsApp) and paid in stages (deposit + balance).

## Core flow

1. NEW DEAL: user pastes a conversation. LLM extracts a structured deal.
2. REVIEW: user sees editable fields, with the source sentence beside each field and ambiguity warnings. Nothing is sent until the user confirms.
3. CREATE: app creates TWO PayPal invoices (deposit and balance) linked to one Deal, then sends both.
4. TRACK: PayPal webhooks (plus polling fallback) update status. On any event, FETCH the invoice from PayPal and store its real status.
5. CHASE: when an invoice is overdue, the LLM drafts a reminder. The user edits and approves, then the app sends it via PayPal's invoice reminder endpoint.
6. DASHBOARD: owed, overdue, expected this week, paid this month, plus a short AI summary.

## Stack

Next.js (TypeScript, App Router, API routes), Tailwind, SQLite (better-sqlite3), zod, Anthropic API (behind src/lib/llm.ts).
PayPal Invoicing API v2, sandbox base URL https://api-m.sandbox.paypal.com. USD only.
Deploy target: Render. NOTE: Render's free filesystem is ephemeral, so run a seed script on boot if the DB is empty.

## Data model (SQLite)

deals(id, client_name, client_email, source_text, extracted_json, total_amount, status, created_at)
invoices(id, deal_id, kind[deposit|balance], paypal_invoice_id, invoice_number, amount, due_date, status, paid_amount, sent_at)
events(id, deal_id, invoice_id, type, payload_json, created_at)
reminders(id, invoice_id, tone[friendly|firm|final], subject, body, status[draft|sent], sent_at)
app_state(key, value) -- includes clock_offset_days for the demo "simulate days" control

## LLM extraction (zod-validated JSON)

{
client_name: string|null, client_email: string|null, currency: "USD",
line_items: [{ description, quantity, unit_price, source_quote }],
deposit: { amount: number|null, percent: number|null, due_date: string|null, source_quote } | null,
balance: { due_date: string|null, source_quote } | null,
ambiguities: [{ field, question }],
overall_confidence: "high"|"medium"|"low"
}
Rules: never invent values. Use null and add an ambiguity. Resolve relative dates ("the 20th", "next Friday") against today's date, which is passed into the prompt. "On delivery" with no date is an ambiguity. If parsing fails, show a manual form pre-filled with whatever parsed.

## PayPal integration (verify exact fields in the official Invoicing v2 docs)

- Auth: POST /v1/oauth2/token (client credentials). Cache the token until expiry.
- Create draft invoice: POST /v2/invoicing/invoices (invoicer = sandbox business account email; recipient = sandbox personal account email; items with amounts as strings with 2 decimals; payment_term due date)
- Send: POST /v2/invoicing/invoices/{id}/send
- Fetch: GET /v2/invoicing/invoices/{id}
- Reminder: POST /v2/invoicing/invoices/{id}/remind (subject, note)
- Webhooks: INVOICING.INVOICE.PAID, .REFUNDED, .CANCELLED. Verify signatures via PayPal's verify-webhook-signature endpoint. The PAID event also covers partial and pending payments, so always fetch the invoice for the true status.
- Polling fallback every 30s for unpaid invoices, plus a manual "Refresh status" button.

## Overdue and demo clock

overdue = unpaid AND due_date < (today + clock_offset_days).
A clearly labeled "Demo: simulate +N days" control changes clock_offset_days.

## Reminders

Tone depends on how many reminders were already sent for that invoice: 0 = friendly, 1 = firm, 2+ = final.
Prompt inputs: original conversation, amount, days overdue, previous reminders. Output: subject and body. Always human-approved before sending.

## Screens

1. New Deal (paste box, extraction result with highlighted source quotes)
2. Review (editable fields, ambiguity warnings, "Create invoices")
3. Dashboard (metrics, deal list with status chips, AI summary)
4. Deal Detail (event timeline, both invoices, reminder draft, Approve and send)

## Quality

- /eval: 15-20 messy sample conversations with labeled expected JSON, and a script printing field-level accuracy.
- Seed data: 3 fictional clients, one paid deal, one overdue deal.
- README: setup, sandbox account notes, architecture diagram, tools used and how, demo steps, eval results.
- .env.example: PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_WEBHOOK_ID, ANTHROPIC_API_KEY, APP_BASE_URL.

## Non-goals

Auth and multi-user, real email sending, multi-currency, a marketplace, mobile apps.
