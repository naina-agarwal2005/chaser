"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExtractedDeal, LineItem } from "@/lib/schemas";

// ─── sample conversations ────────────────────────────────────────────────────
const SAMPLES = [
  {
    label: "Branding Project",
    text: `Hi! Confirming the brand identity project for my startup, Luminos.

Client name: Priya Mehta
Client email: priya.mehta@luminos.io

There is one billable line item:
- Description: Complete brand identity package (logo design, brand guidelines document, and 3 social media templates)
- Quantity: 1
- Unit price: $2,400 USD
- Project total: $2,400 USD

Payment terms:
- Deposit: 50% of the total, exactly $1,200 USD, due in 2 days.
- Balance: the remaining $1,200 USD, due in 21 days.

Please send the deposit invoice first and the balance invoice for the remaining amount. Thanks!`,
  },
  {
    label: "Website Redesign",
    text: `Hi, I want to redesign my agency website. We discussed 5 custom pages at $300 each. I can pay you when it's done – I don't have a specific date yet. My name is Marcus Webb.`,
  },
  {
    label: "Photography Gig",
    text: `Quick summary from our chat: 4-hour product shoot on the 20th, $800 for the session plus $150 for editing (20 final images). Half up front by Nov 15. Client: studio@trendhaus.com`,
  },
];

// ─── helpers ─────────────────────────────────────────────────────────────────
function confidenceBadge(c: string) {
  const map: Record<string, string> = {
    high: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
    medium: "bg-amber-100 text-amber-800 ring-amber-600/20",
    low: "bg-rose-100 text-rose-800 ring-rose-600/20",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        map[c] ?? map.low
      }`}
    >
      {c.charAt(0).toUpperCase() + c.slice(1)} confidence
    </span>
  );
}

function SourceBadge({ quote }: { quote: string }) {
  if (!quote) return null;
  return (
    <span
      className="mt-1 block truncate max-w-xs rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 italic"
      title={quote}
    >
      "{quote}"
    </span>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  sourceQuote,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  sourceQuote?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? ""}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {sourceQuote && <SourceBadge quote={sourceQuote} />}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────
type Step = "new" | "review";

export default function NewDealPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("new");

  // Step 1 state
  const [rawText, setRawText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [aiWarning, setAiWarning] = useState<string | null>(null); // non-fatal fallback message
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Step 2 (review) state – built from extraction or manual
  const [deal, setDeal] = useState<ExtractedDeal | null>(null);
  const [dismissedAmbiguities, setDismissedAmbiguities] = useState<number[]>([]);

  // ── extraction ──────────────────────────────────────────────────────────────
  const handleExtract = useCallback(async () => {
    setExtractError(null);
    setAiWarning(null);
    setExtracting(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      const data = await res.json();

      if (data.success && data.data) {
        // AI succeeded – zero fake data, use exactly what the model returned
        setDeal({
          ...data.data,
          balance: data.data.balance ?? { due_date: null, source_quote: "" },
        });
        setDismissedAmbiguities([]);
        setStep("review");
      } else if (data.extraction_error && data.fallback) {
        // AI failed but we have a default form – open review in manual mode
        setAiWarning(data.error ?? "AI extraction failed. Manual entry mode.");
        setDeal({
          ...data.fallback,
          balance: data.fallback.balance ?? { due_date: null, source_quote: "" },
        });
        setDismissedAmbiguities([]);
        setStep("review");
      } else {
        setExtractError(data.error ?? "Extraction failed with no fallback.");
      }
    } catch (err: any) {
      setExtractError(err.message ?? "Network error while calling /api/extract.");
    } finally {
      setExtracting(false);
    }
  }, [rawText]);

  // ── deal field helpers ──────────────────────────────────────────────────────
  const setField = <K extends keyof ExtractedDeal>(key: K, value: ExtractedDeal[K]) => {
    setDeal((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const setLineItem = (idx: number, patch: Partial<LineItem>) => {
    setDeal((prev) => {
      if (!prev) return prev;
      const items = prev.line_items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      return { ...prev, line_items: items };
    });
  };

  const addLineItem = () => {
    setDeal((prev) =>
      prev
        ? {
            ...prev,
            line_items: [
              ...prev.line_items,
              { description: "", quantity: 1, unit_price: 0, source_quote: "" },
            ],
          }
        : prev
    );
  };

  const removeLineItem = (idx: number) => {
    setDeal((prev) =>
      prev && prev.line_items.length > 1
        ? { ...prev, line_items: prev.line_items.filter((_, i) => i !== idx) }
        : prev
    );
  };

  const toggleDeposit = (enabled: boolean) => {
    setDeal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        deposit: enabled
          ? { amount: null, percent: null, due_date: null, source_quote: "" }
          : null,
      };
    });
  };

  const handleCreate = async () => {
    if (!deal) return;
    setCreateError(null);
    setCreating(true);
    try {
      const response = await fetch("/api/deals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal, source_text: rawText }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const statusNote = result.partial
          ? " One or more invoices were created; check the dashboard before trying again."
          : result.dealSaved
            ? " The deal was saved, but no invoices were recorded locally. PayPal's response may not confirm whether it processed the request, so check PayPal Sandbox before retrying."
            : "";
        throw new Error(`${result.error ?? "Could not create invoices."}${statusNote}`);
      }
      router.push("/");
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Could not create the deal and PayPal invoices."
      );
    } finally {
      setCreating(false);
    }
  };

  // ── computed ────────────────────────────────────────────────────────────────
  const totalAmount =
    deal?.line_items.reduce((s, it) => s + it.quantity * it.unit_price, 0) ?? 0;
  const visibleAmbiguities = deal
    ? deal.ambiguities.filter((_, i) => !dismissedAmbiguities.includes(i))
    : [];

  // ════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* ── top nav ── */}
      <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-semibold text-slate-900">
            Chaser
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm text-slate-600">New Deal</span>
          {step === "review" && (
            <>
              <span className="text-slate-300">/</span>
              <span className="text-sm text-slate-600">Review</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {step === "review" && (
            <button
              onClick={() => { setStep("new"); setAiWarning(null); }}
              className="text-xs text-slate-500 hover:text-slate-800 transition"
            >
              ← Back to paste
            </button>
          )}
          <Link href="/test" className="text-xs text-slate-500 hover:text-slate-800 transition">
            /test →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* ══════════════════════════════════════════════════════════════
            STEP 1 – NEW DEAL (paste box)
        ══════════════════════════════════════════════════════════════ */}
        {step === "new" && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">New Deal</h1>
              <p className="mt-1 text-sm text-slate-500">
                Paste a client conversation (email, Slack, WhatsApp) and the AI will extract the
                deal terms for you to review and edit.
              </p>
            </div>

            {/* sample presets */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-slate-500 self-center">Sample Chat:</span>
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setRawText(s.text)}
                  className="text-xs rounded-full border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100 transition"
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Paste conversation
              </label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={12}
                placeholder="Hey, just confirming our deal — $1,500 for the logo + 3 revisions. I'll send 50% now and the rest when it's done. My email is alex@example.com."
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />

              {extractError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                  <strong>Error:</strong> {extractError}
                </div>
              )}

              <button
                onClick={handleExtract}
                disabled={extracting || !rawText.trim()}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-sm transition ${
                  extracting || !rawText.trim()
                    ? "bg-blue-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700"
                }`}
              >
                {extracting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Analyzing conversation with AI…
                  </>
                ) : (
                  "Extract with AI →"
                )}
              </button>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 2 – REVIEW
        ══════════════════════════════════════════════════════════════ */}
        {step === "review" && deal && (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Review Deal</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Edit any field, then confirm. Quoted source text appears in italic beneath each
                  field.
                </p>
              </div>
              {confidenceBadge(deal.overall_confidence)}
            </div>

            {/* AI fallback warning */}
            {aiWarning && (
              <div className="rounded-lg bg-amber-50 border border-amber-300 p-4 text-sm text-amber-900">
                <strong>⚠ AI extraction failed – manual entry mode.</strong>
                <p className="mt-1 text-xs text-amber-700">{aiWarning}</p>
              </div>
            )}

            {/* Ambiguity warnings */}
            {visibleAmbiguities.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-300 p-5 space-y-3">
                <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                  <span>⚠</span> {visibleAmbiguities.length} ambiguit
                  {visibleAmbiguities.length === 1 ? "y" : "ies"} need your attention
                </h3>
                <ul className="space-y-2">
                  {deal.ambiguities.map((amb, i) =>
                    dismissedAmbiguities.includes(i) ? null : (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-3 rounded-lg bg-amber-100 px-3 py-2.5"
                      >
                        <div>
                          <span className="text-xs font-semibold text-amber-900 font-mono">
                            {amb.field}
                          </span>
                          <p className="text-xs text-amber-800 mt-0.5">{amb.question}</p>
                        </div>
                        <button
                          onClick={() => setDismissedAmbiguities((p) => [...p, i])}
                          className="shrink-0 text-xs text-amber-700 hover:text-amber-900 font-medium"
                        >
                          Dismiss ✕
                        </button>
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}

            {/* ── Client Info ── */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                Client Info
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  label="Client Name"
                  value={deal.client_name ?? ""}
                  onChange={(v) => setField("client_name", v || null)}
                  placeholder="e.g. Priya Mehta"
                />
                <InputField
                  label="Client Email"
                  type="email"
                  value={deal.client_email ?? ""}
                  onChange={(v) => setField("client_email", v || null)}
                  placeholder="e.g. priya@example.com"
                />
              </div>
            </section>

            {/* ── Line Items ── */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                  Line Items
                </h2>
                <span className="text-xs font-semibold text-slate-600">
                  Total: ${totalAmount.toFixed(2)} USD
                </span>
              </div>

              {deal.line_items.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      Item {idx + 1}
                    </span>
                    {deal.line_items.length > 1 && (
                      <button
                        onClick={() => removeLineItem(idx)}
                        className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                      >
                        Remove ✕
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => setLineItem(idx, { description: e.target.value })}
                        placeholder="e.g. Logo design"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) =>
                          setLineItem(idx, { quantity: Math.max(1, Number(e.target.value)) })
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Unit Price (USD)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.unit_price}
                        onChange={(e) =>
                          setLineItem(idx, { unit_price: Math.max(0, Number(e.target.value)) })
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  {item.source_quote && <SourceBadge quote={item.source_quote} />}
                </div>
              ))}

              <button
                onClick={addLineItem}
                className="w-full rounded-lg border border-dashed border-slate-300 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                + Add Line Item
              </button>
            </section>

            {/* ── Deposit ── */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                  Deposit
                </h2>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deal.deposit !== null}
                    onChange={(e) => toggleDeposit(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-700">Include deposit</span>
                </label>
              </div>

              {deal.deposit !== null && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Amount (USD)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={deal.deposit.amount ?? ""}
                      placeholder="e.g. 1200.00"
                      onChange={(e) =>
                        setDeal((p) =>
                          p && p.deposit
                            ? {
                                ...p,
                                deposit: {
                                  ...p.deposit,
                                  amount: e.target.value ? Number(e.target.value) : null,
                                },
                              }
                            : p
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Percent (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={deal.deposit.percent ?? ""}
                      placeholder="e.g. 50"
                      onChange={(e) =>
                        setDeal((p) =>
                          p && p.deposit
                            ? {
                                ...p,
                                deposit: {
                                  ...p.deposit,
                                  percent: e.target.value ? Number(e.target.value) : null,
                                },
                              }
                            : p
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={deal.deposit.due_date ?? ""}
                      onChange={(e) =>
                        setDeal((p) =>
                          p && p.deposit
                            ? {
                                ...p,
                                deposit: {
                                  ...p.deposit,
                                  due_date: e.target.value || null,
                                },
                              }
                            : p
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {deal.deposit.source_quote && (
                    <div className="sm:col-span-3">
                      <SourceBadge quote={deal.deposit.source_quote} />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ── Balance ── */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                  Balance / Final Payment
                </h2>
                <span className="text-xs text-slate-500">Always created</span>
              </div>

              <div className="space-y-3">
                  <div className="max-w-xs">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={deal.balance?.due_date ?? ""}
                      onChange={(e) =>
                        setDeal((p) =>
                          p
                            ? {
                                ...p,
                                balance: {
                                  ...(p.balance ?? { due_date: null, source_quote: "" }),
                                  due_date: e.target.value || null,
                                },
                              }
                            : p
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {deal.balance?.source_quote && (
                    <SourceBadge quote={deal.balance.source_quote} />
                  )}
              </div>
            </section>

            {createError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <strong>Invoice creation failed.</strong> {createError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={creating}
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm ${
                  creating ? "bg-blue-400 cursor-wait" : "bg-blue-600 hover:bg-blue-500"
                }`}
              >
                {creating ? "Creating and sending invoices…" : "Confirm & Create PayPal Invoices"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
