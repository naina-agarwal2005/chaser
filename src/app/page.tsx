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
  paypal_invoice_id: string;
};

type DashboardDeal = {
  id: number;
  client_name: string | null;
  client_email: string | null;
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
      !["PAID", "CANCELLED", "REFUNDED", "DRAFT"].includes(invoice.status)
    );

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
                                    <span className="font-medium capitalize text-slate-700">
                                      {invoice.kind ?? "invoice"}
                                    </span>
                                    <span className="ml-1 text-slate-500">
                                      {money(invoice.amount)}
                                    </span>
                                    {isOverdue(invoice) && (
                                      <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">
                                        OVERDUE
                                      </span>
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
    </main>
  );
}
