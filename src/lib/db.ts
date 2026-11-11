import Database from "better-sqlite3";
import path from "path";

export interface InvoiceRecord {
  id?: number;
  paypal_invoice_id: string;
  invoice_number: string | null;
  amount: string;
  due_amount: string;
  due_date: string | null;
  status: string;
  paid_amount: string;
  recipient_email: string | null;
  recipient_view_url: string | null;
  created_at: string;
}

const dbPath = path.join(process.cwd(), "chaser.db");

// Use global singleton in development to prevent duplicate connections during hot-reloads
const globalForDb = global as unknown as { db?: Database.Database };

export const db: Database.Database =
  globalForDb.db ??
  new Database(dbPath);

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

// Enable Write-Ahead Logging for better concurrent read/write performance
db.pragma("journal_mode = WAL");

// Initialize invoices table
db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paypal_invoice_id TEXT UNIQUE NOT NULL,
    invoice_number TEXT,
    amount TEXT NOT NULL,
    due_amount TEXT NOT NULL DEFAULT '0.00',
    due_date TEXT,
    status TEXT NOT NULL,
    paid_amount TEXT NOT NULL DEFAULT '0.00',
    recipient_email TEXT,
    recipient_view_url TEXT,
    created_at TEXT NOT NULL
  );
`);

/**
 * Upsert an invoice record in the database
 */
export function upsertInvoice(invoice: Omit<InvoiceRecord, "id">): InvoiceRecord {
  const stmt = db.prepare(`
    INSERT INTO invoices (
      paypal_invoice_id,
      invoice_number,
      amount,
      due_amount,
      due_date,
      status,
      paid_amount,
      recipient_email,
      recipient_view_url,
      created_at
    ) VALUES (
      @paypal_invoice_id,
      @invoice_number,
      @amount,
      @due_amount,
      @due_date,
      @status,
      @paid_amount,
      @recipient_email,
      @recipient_view_url,
      @created_at
    )
    ON CONFLICT(paypal_invoice_id) DO UPDATE SET
      invoice_number = excluded.invoice_number,
      amount = excluded.amount,
      due_amount = excluded.due_amount,
      due_date = excluded.due_date,
      status = excluded.status,
      paid_amount = excluded.paid_amount,
      recipient_email = excluded.recipient_email,
      recipient_view_url = COALESCE(excluded.recipient_view_url, invoices.recipient_view_url)
    RETURNING *;
  `);

  return stmt.get(invoice) as InvoiceRecord;
}

/**
 * Update only status, paid amount, due amount and optional view URL
 */
export function updateInvoiceStatusInDb(
  paypalInvoiceId: string,
  status: string,
  paidAmount: string,
  dueAmount: string,
  recipientViewUrl?: string | null
): InvoiceRecord | null {
  const stmt = db.prepare(`
    UPDATE invoices
    SET status = ?,
        paid_amount = ?,
        due_amount = ?,
        recipient_view_url = COALESCE(?, recipient_view_url)
    WHERE paypal_invoice_id = ?
    RETURNING *;
  `);

  const updated = stmt.get(status, paidAmount, dueAmount, recipientViewUrl || null, paypalInvoiceId);
  return (updated as InvoiceRecord) || null;
}

/**
 * Get all invoices ordered by latest created
 */
export function getAllInvoices(): InvoiceRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM invoices ORDER BY id DESC;
  `);
  return stmt.all() as InvoiceRecord[];
}

/**
 * Get single invoice by PayPal Invoice ID
 */
export function getInvoiceByPayPalId(paypalInvoiceId: string): InvoiceRecord | null {
  const stmt = db.prepare(`
    SELECT * FROM invoices WHERE paypal_invoice_id = ?;
  `);
  const record = stmt.get(paypalInvoiceId);
  return (record as InvoiceRecord) || null;
}

/**
 * Get all invoices that are not in terminal state (PAID, CANCELLED, REFUNDED)
 */
export function getUnfinishedInvoices(): InvoiceRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM invoices
    WHERE status NOT IN ('PAID', 'CANCELLED', 'REFUNDED')
    ORDER BY id DESC;
  `);
  return stmt.all() as InvoiceRecord[];
}
