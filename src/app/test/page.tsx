"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface InvoiceRecord {
  id: number;
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

export default function TestPage() {
  // Test creation states
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Import states
  const [importId, setImportId] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Invoices table state
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all invoices from database
  const loadInvoices = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices");
      const data = await res.json();
      if (data.success && Array.isArray(data.invoices)) {
        setInvoices(data.invoices);
      }
    } catch (err) {
      console.error("Failed to load invoices:", err);
    } finally {
      setTableLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // 30-Second Polling for unpaid invoices (Requirement 4)
  const pollUnpaidInvoices = useCallback(async () => {
    try {
      setIsPolling(true);
      const res = await fetch("/api/invoices/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncAllUnpaid: true }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.invoices)) {
        setInvoices(data.invoices);
        setLastSyncedTime(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("30s poll error:", err);
    } finally {
      setIsPolling(false);
    }
  }, []);

  useEffect(() => {
    // Run poll every 30 seconds
    pollTimerRef.current = setInterval(() => {
      pollUnpaidInvoices();
    }, 30000);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [pollUnpaidInvoices]);

  // Handle single invoice status refresh
  const handleRefreshSingle = async (paypalInvoiceId: string) => {
    setSyncingId(paypalInvoiceId);
    try {
      const res = await fetch("/api/invoices/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: paypalInvoiceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`Failed to refresh ${paypalInvoiceId}: ${data.error || "Unknown error"}`);
        return;
      }
      if (data.allInvoices) {
        setInvoices(data.allInvoices);
      } else {
        await loadInvoices();
      }
      setLastSyncedTime(new Date().toLocaleTimeString());
    } catch (err: any) {
      alert(`Refresh error: ${err.message || String(err)}`);
    } finally {
      setSyncingId(null);
    }
  };

  // Handle Import of existing invoice (Requirement 6)
  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const idToImport = importId.trim();
    if (!idToImport) return;

    setImportLoading(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const res = await fetch("/api/invoices/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: idToImport }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to import invoice ${idToImport}`);
      }

      setImportSuccess(`Successfully imported & synced invoice ${data.invoice.paypal_invoice_id} (${data.invoice.status})!`);
      setImportId("");
      if (data.allInvoices) {
        setInvoices(data.allInvoices);
      } else {
        await loadInvoices();
      }
      setLastSyncedTime(new Date().toLocaleTimeString());
    } catch (err: any) {
      setImportError(err.message || "Failed to import invoice.");
    } finally {
      setImportLoading(false);
    }
  };

  // Handle Create and Send test invoice
  const handleRunTest = async () => {
    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await fetch("/api/test-paypal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      // Refresh table regardless because row is saved whenever draft is created
      await loadInvoices();

      if (!res.ok || !data.success) {
        // Requirement 1: Show the real PayPal error directly, no fallback
        throw new Error(data.error || "PayPal invoice operation failed.");
      }

      setCreateSuccess(`Invoice ${data.invoiceId} successfully created, sent, and saved to DB! Status: ${data.status}`);
    } catch (err: any) {
      setCreateError(err.message || "An unexpected error occurred during test execution.");
    } finally {
      setCreateLoading(false);
    }
  };

  // Status chip styles
  const getStatusChip = (status: string) => {
    const s = status.toUpperCase();
    if (s === "PAID") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
          PAID
        </span>
      );
    }
    if (s === "SENT" || s === "UNPAID" || s === "PAYMENT_PENDING") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-600/20">
          {s}
        </span>
      );
    }
    if (s === "DRAFT") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-600/20">
          DRAFT
        </span>
      );
    }
    if (s === "CANCELLED" || s === "REFUNDED") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-600/20">
          {s}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-600/20">
        {s}
      </span>
    );
  };

  const unpaidCount = invoices.filter(
    (i) => i.status !== "PAID" && i.status !== "CANCELLED" && i.status !== "REFUNDED"
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Stage 2: PayPal Invoicing & SQLite Sync
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Database persistence, real status synchronization, and 30-second automated polling.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              <span className={`h-2 w-2 rounded-full ${isPolling ? "bg-amber-500 animate-ping" : "bg-emerald-500"}`}></span>
              30s Poll Active ({unpaidCount} unpaid)
            </span>
            <Link
              href="/"
              className="text-xs font-medium text-slate-600 hover:text-slate-900 transition"
            >
              &larr; Home
            </Link>
          </div>
        </div>

        {/* Action Controls Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Create Test Invoice */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                  1. Create Sandbox Test Invoice
                </h2>
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono">
                  $150.00 USD
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-600">
                Creates a draft in PayPal Sandbox, saves the row to SQLite (better-sqlite3), and sends it to the recipient configured in <code className="bg-slate-100 px-1 py-0.5 rounded">.env</code>.
              </p>
              <div className="mt-2 text-xs text-slate-500 italic">
                * Note: Any PayPal error is shown directly with no fake fallback email.
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {createError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                  <span className="font-semibold">PayPal Error:</span> {createError}
                </div>
              )}
              {createSuccess && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                  {createSuccess}
                </div>
              )}

              <button
                onClick={handleRunTest}
                disabled={createLoading}
                className={`w-full inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
                  createLoading
                    ? "bg-blue-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700"
                }`}
              >
                {createLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Creating & Saving to SQLite...
                  </span>
                ) : (
                  "Create & Send Test Invoice"
                )}
              </button>
            </div>
          </div>

          {/* Card 2: Import Existing Invoice (Requirement 6) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                  2. Import Existing Invoice ID
                </h2>
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                  GET /v2/invoicing/invoices
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-600">
                Paste an existing invoice ID (such as <code className="bg-slate-100 px-1 py-0.5 rounded font-bold font-mono">INV2-85X3-GZXH-WV2X-BRQU</code>) to fetch its real status from PayPal and save/sync it in the SQLite database.
              </p>
            </div>

            <form onSubmit={handleImport} className="mt-5 space-y-3">
              {importError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                  <span className="font-semibold">Import Error:</span> {importError}
                </div>
              )}
              {importSuccess && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                  {importSuccess}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste Invoice ID (e.g. INV2-85X3-GZXH-WV2X-BRQU)"
                  value={importId}
                  onChange={(e) => setImportId(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setImportId("INV2-85X3-GZXH-WV2X-BRQU")}
                  className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                  title="Fill with paid sample ID"
                >
                  Sample ID
                </button>
              </div>

              <button
                type="submit"
                disabled={importLoading || !importId.trim()}
                className={`w-full inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
                  importLoading || !importId.trim()
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700"
                }`}
              >
                {importLoading ? "Fetching & Importing..." : "Import & Sync to Table"}
              </button>
            </form>
          </div>
        </div>

        {/* Invoices Table Section (Requirement 5) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Invoices Table (SQLite: better-sqlite3)
                </h3>
                <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-semibold">
                  {invoices.length} {invoices.length === 1 ? "record" : "records"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Polls every 30s for non-terminal statuses. {lastSyncedTime ? `Last synced: ${lastSyncedTime}` : ""}
              </p>
            </div>

            <button
              onClick={pollUnpaidInvoices}
              disabled={isPolling}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <svg
                className={`h-3.5 w-3.5 text-slate-500 ${isPolling ? "animate-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isPolling ? "Syncing..." : "Sync All Unpaid"}
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-semibold">
                  <th className="py-3 px-4">Invoice ID</th>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Due Amount</th>
                  <th className="py-3 px-4">Paid Amount</th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Recipient View</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableLoading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      Loading invoices from database...
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <svg className="h-8 w-8 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="font-medium text-slate-700">No invoices in database yet.</p>
                        <p className="text-slate-400 text-xs mt-1">
                          Click &quot;Create &amp; Send Test Invoice&quot; or import an invoice ID above.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.paypal_invoice_id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900 select-all">
                        {inv.paypal_invoice_id}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {inv.invoice_number ? `#${inv.invoice_number}` : "-"}
                      </td>
                      <td className="py-3 px-4">
                        {getStatusChip(inv.status)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        ${inv.amount} USD
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        ${inv.due_amount}
                      </td>
                      <td className="py-3 px-4 text-emerald-700 font-medium">
                        ${inv.paid_amount}
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={inv.recipient_email || ""}>
                        {inv.recipient_email || "-"}
                      </td>
                      <td className="py-3 px-4">
                        {inv.recipient_view_url ? (
                          <a
                            href={inv.recipient_view_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium underline"
                          >
                            <span>Pay/View</span>
                            <span className="text-[10px]">&nearr;</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleRefreshSingle(inv.paypal_invoice_id)}
                          disabled={syncingId === inv.paypal_invoice_id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition disabled:opacity-50"
                          title="Fetch live status from PayPal"
                        >
                          {syncingId === inv.paypal_invoice_id ? (
                            <>
                              <svg className="animate-spin h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                              </svg>
                              <span>Syncing</span>
                            </>
                          ) : (
                            <span>Refresh status</span>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
