import Database from "better-sqlite3";
import path from "path";

export interface InvoiceRecord {
  id?: number;
  deal_id?: number | null;
  kind?: "deposit" | "balance" | null;
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
  sent_at?: string | null;
}

export interface DealRecord {
  id: number;
  client_name: string | null;
  client_email: string | null;
  source_text: string;
  extracted_json: string;
  total_amount: string;
  status: string;
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

// Initialize Stage 2 tables, then migrate existing invoices for deal tracking.
db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER,
    kind TEXT CHECK (kind IS NULL OR kind IN ('deposit', 'balance')),
    paypal_invoice_id TEXT UNIQUE NOT NULL,
    invoice_number TEXT,
    amount TEXT NOT NULL,
    due_amount TEXT NOT NULL DEFAULT '0.00',
    due_date TEXT,
    status TEXT NOT NULL,
    paid_amount TEXT NOT NULL DEFAULT '0.00',
    recipient_email TEXT,
    recipient_view_url TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT,
    FOREIGN KEY (deal_id) REFERENCES deals(id)
  );

  CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT,
    client_email TEXT,
    source_text TEXT NOT NULL DEFAULT '',
    extracted_json TEXT NOT NULL DEFAULT '{}',
    total_amount TEXT NOT NULL DEFAULT '0.00',
    status TEXT NOT NULL DEFAULT 'UNPAID',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function addInvoiceColumnIfMissing(name: string, sql: string): void {
  const columns = db
    .prepare("PRAGMA table_info(invoices)")
    .all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === name)) return;

  try {
    db.exec(sql);
  } catch (error) {
    const anotherInitializerAddedColumn =
      error instanceof Error && error.message.includes(`duplicate column name: ${name}`);
    if (!anotherInitializerAddedColumn) throw error;
  }
}

addInvoiceColumnIfMissing(
  "deal_id",
  "ALTER TABLE invoices ADD COLUMN deal_id INTEGER REFERENCES deals(id)"
);
addInvoiceColumnIfMissing("kind", "ALTER TABLE invoices ADD COLUMN kind TEXT");
addInvoiceColumnIfMissing("sent_at", "ALTER TABLE invoices ADD COLUMN sent_at TEXT");

db.exec(`
  CREATE INDEX IF NOT EXISTS invoices_deal_id_idx ON invoices(deal_id);
  INSERT OR IGNORE INTO app_state (key, value) VALUES ('clock_offset_days', '0');
`);

/**
 * Upsert an invoice record in the database
 */
export function upsertInvoice(
  invoice: Omit<InvoiceRecord, "id"> & Partial<Pick<InvoiceRecord, "deal_id" | "kind" | "sent_at">>
): InvoiceRecord {
  const stmt = db.prepare(`
    INSERT INTO invoices (
      deal_id,
      kind,
      paypal_invoice_id,
      invoice_number,
      amount,
      due_amount,
      due_date,
      status,
      paid_amount,
      recipient_email,
      recipient_view_url,
      created_at,
      sent_at
    ) VALUES (
      @deal_id,
      @kind,
      @paypal_invoice_id,
      @invoice_number,
      @amount,
      @due_amount,
      @due_date,
      @status,
      @paid_amount,
      @recipient_email,
      @recipient_view_url,
      @created_at,
      @sent_at
    )
    ON CONFLICT(paypal_invoice_id) DO UPDATE SET
      deal_id = COALESCE(excluded.deal_id, invoices.deal_id),
      kind = COALESCE(excluded.kind, invoices.kind),
      invoice_number = excluded.invoice_number,
      amount = excluded.amount,
      due_amount = excluded.due_amount,
      due_date = excluded.due_date,
      status = excluded.status,
      paid_amount = excluded.paid_amount,
      recipient_email = excluded.recipient_email,
      recipient_view_url = COALESCE(excluded.recipient_view_url, invoices.recipient_view_url),
      sent_at = COALESCE(excluded.sent_at, invoices.sent_at)
    RETURNING *;
  `);

  return stmt.get({
    ...invoice,
    deal_id: invoice.deal_id ?? null,
    kind: invoice.kind ?? null,
    sent_at: invoice.sent_at ?? null,
  }) as InvoiceRecord;
}

export function createDeal(input: {
  client_name: string | null;
  client_email: string | null;
  source_text: string;
  extracted_json: string;
  total_amount: number;
}): DealRecord {
  return db
    .prepare(
      `INSERT INTO deals
        (client_name, client_email, source_text, extracted_json, total_amount, status, created_at)
       VALUES
        (@client_name, @client_email, @source_text, @extracted_json, @total_amount, 'UNPAID', @created_at)
       RETURNING *`
    )
    .get({
      ...input,
      total_amount: input.total_amount.toFixed(2),
      created_at: new Date().toISOString(),
    }) as DealRecord;
}

export function markInvoiceSent(paypalInvoiceId: string): void {
    db.prepare("UPDATE invoices SET sent_at = ? WHERE paypal_invoice_id = ?").run(
      new Date().toISOString(),
      paypalInvoiceId
    );
}

export function getAllDeals(): DealRecord[] {
  return db.prepare("SELECT * FROM deals ORDER BY id DESC").all() as DealRecord[];
}

export function getClockOffsetDays(): number {
  const row = db
    .prepare("SELECT value FROM app_state WHERE key = 'clock_offset_days'")
    .get() as { value: string } | undefined;
  const offset = Number(row?.value ?? 0);
  return Number.isInteger(offset) ? offset : 0;
}

export function setClockOffsetDays(days: number): void {
  db.prepare(
    `INSERT INTO app_state (key, value) VALUES ('clock_offset_days', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(days));
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
