"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type DashboardInvoice = {
  id: number;
  kind: "deposit" | "balance" | null;
  amount: string;
  due_amount: string;
  paid_amount: string;
  due_date: string | null;
  status: string;
  recipient_view_url: string | null;
  paypal_invoice_id: string;
};

type DashboardDeal = {
  id: number;
  client_name: string | null;
  client_email: string | null;
  source_text: string;
  total_amount: string;
  created_at: string;
  status: "UNPAID" | "PAID" | "PARTIALLY_PAID";
  invoices: DashboardInvoice[];
};

type DashboardData = {
  metrics: { totalOwed: string; totalOverdue: string; totalPaid: string };
  deals: DashboardDeal[];
  clockOffsetDays: number;
  today: string;
};

type ReminderDraft = {
  reminderId: number;
  tone: "friendly" | "firm" | "final";
  daysOverdue: number;
  subject: string;
  body: string;
};

function money(value: string | number): string {
  const amount = Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function StatusChip({ status }: { status: DashboardDeal["status"] }) {
  const style = {
    UNPAID: "bg-slate-100 text-slate-700",
    PAID: "bg-emerald-100 text-emerald-800",
    PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  }[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>
      {status}
    </span>
  );
}

export default function Home() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clockUpdating, setClockUpdating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(null);
  const [draftingReminder, setDraftingReminder] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error ?? "Could not load dashboard.");
    }
    setDashboard(data);
    setError(null);
  }, []);

  useEffect(() => {
    loadDashboard()
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : "Could not load dashboard.")
      )
      .finally(() => setLoading(false));
  }, [loadDashboard]);

  const refreshStatuses = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/invoices/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncAllUnpaid: true }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Invoice status refresh failed.");
      }
      const failures = (result.results ?? []).filter(
        (item: { error?: string }) => item.error
      );
      setNotice(
        failures.length
          ? `Refreshed ${result.syncedCount - failures.length} invoices; ${failures.length} could not be refreshed.`
          : `Refreshed ${result.syncedCount} invoice${result.syncedCount === 1 ? "" : "s"}.`
      );
      await loadDashboard();
    } catch (refreshError) {
      setNotice(
        refreshError instanceof Error ? refreshError.message : "Invoice status refresh failed."
      );
    } finally {
      setRefreshing(false);
    }
  };

  const simulateWeek = async (reset = false) => {
    setClockUpdating(true);
    setNotice(null);
    try {
      const response = await fetch("/api/demo-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { reset: true } : { advanceDays: 7 }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Could not update the demo clock.");
      }
      await loadDashboard();
      setNotice(
        reset
          ? "Demo clock reset to today."
          : `Demo clock advanced by 7 days (${result.clockOffsetDays} days total).`
      );
    } catch (clockError) {
      setNotice(clockError instanceof Error ? clockError.message : "Could not update the demo clock.");
    } finally {
      setClockUpdating(false);
    }
  };

  const isOverdue = (invoice: DashboardInvoice) =>
    Boolean(
      invoice.due_date &&
        invoice.due_date < (dashboard?.today ?? "") &&
      Number(invoice.due_amount) > 0 &&
      !["PAID", "MARKED_AS_PAID", "CANCELLED", "REFUNDED", "DRAFT"].includes(
        invoice.status
      )
    );

  const openReminderDraft = async (invoice: DashboardInvoice) => {
    setSelectedInvoice({
      id: invoice.id,
      label: `${invoice.kind ?? "invoice"} ${money(invoice.due_amount)}`,
    });
    setReminderDraft(null);
    setReminderError(null);
    setCopyMessage(null);
    setDraftingReminder(true);
    try {
      const response = await fetch("/api/reminders/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: invoice.id }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
      throw new Error(result.error ?? "Could not draft the reminder.");
      }
      setReminderDraft({
      reminderId: result.reminderId,
      tone: result.tone,
      daysOverdue: result.daysOverdue,
      subject: result.subject,
      body: result.body,
      });
    } catch (draftError) {
      setReminderError(
      draftError instanceof Error ? draftError.message : "Could not draft the reminder."
      );
    } finally {
      setDraftingReminder(false);
    }
  };

  const sendReminder = async () => {
    if (!selectedInvoice || !reminderDraft) return;
    setSendingReminder(true);
    setReminderError(null);
    try {
      const response = await fetch("/api/reminders/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId: selectedInvoice.id,
        reminderId: reminderDraft.reminderId,
        subject: reminderDraft.subject,
        body: reminderDraft.body,
      }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
      throw new Error(result.error ?? "Could not send reminder via PayPal.");
      }
      setSelectedInvoice(null);
      setReminderDraft(null);
      setNotice("Reminder sent to the client via PayPal.");
      await loadDashboard();
    } catch (sendError) {
      setReminderError(
      sendError instanceof Error ? sendError.message : "Could not send reminder via PayPal."
      );
    } finally {
      setSendingReminder(false);
    }
  };

  const copyReminder = async () => {
    if (!reminderDraft) return;
    try {
      await navigator.clipboard.writeText(
      `Subject: ${reminderDraft.subject}\n\n${reminderDraft.body}`
      );
      setCopyMessage("Subject and message copied.");
    } catch {
      setCopyMessage("Clipboard access is unavailable in this browser.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Chaser</h1>
            <p className="text-xs text-slate-500">PayPal invoice dashboard</p>
          </div>
          <Link
            href="/deals/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            + New Deal
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Overview</h2>
            <p className="mt-1 text-sm text-slate-500">
              Track what is owed and keep deal invoices up to date.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={refreshStatuses}
              disabled={refreshing || loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh All Statuses"}
            </button>
            <button
              onClick={() => simulateWeek()}
              disabled={clockUpdating}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {clockUpdating ? "Updating…" : "Simulate +7 Days (Overdue)"}
            </button>
            {Boolean(dashboard?.clockOffsetDays) && (
              <button
                onClick={() => simulateWeek(true)}
                disabled={clockUpdating}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Reset demo clock
              </button>
            )}
          </div>
        </div>

        {dashboard && dashboard.clockOffsetDays > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            Demo clock is advanced by {dashboard.clockOffsetDays} days. Invoice overdue status is
            calculated against {dashboard.today}.
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading dashboard…
          </div>
        ) : dashboard ? (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Total Owed", value: dashboard.metrics.totalOwed, accent: "text-slate-900" },
                { label: "Total Overdue", value: dashboard.metrics.totalOverdue, accent: "text-rose-700" },
                { label: "Total Paid", value: dashboard.metrics.totalPaid, accent: "text-emerald-700" },
              ].map((metric) => (
                <article
                  key={metric.label}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-sm font-medium text-slate-500">{metric.label}</p>
                  <p className={`mt-2 text-2xl font-bold ${metric.accent}`}>
                    {money(metric.value)}
                  </p>
                </article>
              ))}
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="font-semibold text-slate-900">Deals</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Deal status follows its PayPal invoices.</p>
                </div>
                <span className="text-xs text-slate-500">{dashboard.deals.length} total</span>
              </div>
              {dashboard.deals.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-medium text-slate-700">No deals yet</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Create a deal to generate and track PayPal invoices.
                  </p>
                  <Link
                    href="/deals/new"
                    className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                  >
                    Create your first deal
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Client / Deal</th>
                        <th className="px-5 py-3 font-semibold">Total</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                        <th className="px-5 py-3 font-semibold">Invoices</th>
                        <th className="px-5 py-3 font-semibold">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dashboard.deals.map((deal) => (
                        <tr key={deal.id} className="align-top">
                          <td className="px-5 py-4">
                            <p className="font-semibold text-slate-900">
                              {deal.client_name || "Unnamed client"}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {deal.client_email || `Deal #${deal.id}`}
                            </p>
                          </td>
                          <td className="px-5 py-4 font-medium text-slate-800">
                            {money(deal.total_amount)}
                          </td>
                          <td className="px-5 py-4">
                            <StatusChip status={deal.status} />
                          </td>
                          <td className="px-5 py-4">
                            <div className="space-y-2">
                              {deal.invoices.length === 0 ? (
                                <span className="text-xs text-slate-400">No invoices created</span>
                              ) : (
                                deal.invoices.map((invoice) => (
                                  <div key={invoice.id} className="text-xs">
                                      <div className="flex flex-wrap items-center gap-y-1">
                                        <span className="font-medium capitalize text-slate-700">
                                          {invoice.kind ?? "invoice"}
                                        </span>
                                        <span className="ml-1 text-slate-500">
                                          {money(invoice.amount)}
                                        </span>
                                        {invoice.recipient_view_url && (
                                          <a
                                            href={invoice.recipient_view_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                                          >
                                            Pay / View ↗
                                          </a>
                                        )}
                                      </div>
                                      {isOverdue(invoice) && (
                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">
                                            OVERDUE
                                          </span>
                                          <button
                                            onClick={() => openReminderDraft(invoice)}
                                            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-700 hover:bg-blue-100"
                                          >
                                            ✉ Draft AI Reminder
                                          </button>
                                        </div>
                                      )}
                                    <p className="mt-0.5 text-slate-400">
                                      {invoice.due_date ? `Due ${invoice.due_date}` : invoice.status}
                                      {invoice.due_date ? ` · ${invoice.status}` : ""}
                                    </p>
                                  </div>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-xs text-slate-500">
                            {new Date(deal.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
      {selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !sendingReminder) {
              setSelectedInvoice(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reminder-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="reminder-title" className="text-lg font-bold text-slate-900">
                  AI overdue reminder
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedInvoice.label}
                  {reminderDraft ? ` · ${reminderDraft.daysOverdue} days overdue` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                disabled={sendingReminder}
                aria-label="Close reminder dialog"
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {draftingReminder && (
              <p className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                Drafting a reminder…
              </p>
            )}
            {reminderError && (
              <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {reminderError}
              </p>
            )}
            {reminderDraft && (
              <>
                <div className="mt-5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Escalation tone
                  </span>
                  <p
                    className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                      reminderDraft.tone === "friendly"
                        ? "bg-emerald-100 text-emerald-800"
                        : reminderDraft.tone === "firm"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {reminderDraft.tone}
                  </p>
                </div>
                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  Subject
                  <input
                    value={reminderDraft.subject}
                    onChange={(event) =>
                      setReminderDraft({ ...reminderDraft, subject: event.target.value })
                    }
                    maxLength={120}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="mt-4 block text-sm font-semibold text-slate-700">
                  Message
                  <textarea
                    value={reminderDraft.body}
                    onChange={(event) =>
                      setReminderDraft({ ...reminderDraft, body: event.target.value })
                    }
                    maxLength={4000}
                    rows={8}
                    className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                {copyMessage && (
                  <p aria-live="polite" className="mt-3 text-xs text-slate-500">
                    {copyMessage}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={copyReminder}
                    disabled={sendingReminder}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Copy Text
                  </button>
                  <button
                    type="button"
                    onClick={sendReminder}
                    disabled={
                      sendingReminder ||
                      !reminderDraft.subject.trim() ||
                      !reminderDraft.body.trim()
                    }
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendingReminder ? "Sending…" : "Approve & Send via PayPal"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
