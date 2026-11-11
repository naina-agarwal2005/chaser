"use client";

import React, { useState } from "react";
import Link from "next/link";

interface StepResult {
  step: string;
  status: "success" | "warning" | "error";
  detail: string;
}

interface TestResponse {
  success: boolean;
  invoiceId?: string;
  status?: string;
  recipient?: string;
  invoicer?: string;
  amount?: {
    currency_code?: string;
    value?: string;
  };
  steps?: StepResult[];
  invoice?: Record<string, unknown>;
  error?: string;
}

export default function TestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const handleRunTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/test-paypal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data: TestResponse = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while executing the test.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="border-b border-slate-200 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Stage 1: PayPal Invoicing Test
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Scaffold verification & live PayPal sandbox integration test.
              </p>
            </div>
            <Link
              href="/"
              className="text-xs font-medium text-slate-600 hover:text-slate-900 transition"
            >
              &larr; Back to Home
            </Link>
          </div>
        </div>

        {/* Hardcoded Test Parameters Preview */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
              Hardcoded Test Invoice Parameters
            </h2>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
              PayPal Sandbox (USD)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">API Scope:</span>
              <p className="mt-0.5 text-slate-500">OAuth2 Token &rarr; Create Draft &rarr; Send &rarr; Fetch</p>
            </div>
            <div>
              <span className="font-semibold text-slate-800">Line Item:</span>
              <p className="mt-0.5 text-slate-500">Design & Brand Strategy Consultation ($150.00 USD)</p>
            </div>
            <div>
              <span className="font-semibold text-slate-800">Invoicer:</span>
              <p className="mt-0.5 text-slate-500">Configured in .env (SANDBOX_BUSINESS_EMAIL)</p>
            </div>
            <div>
              <span className="font-semibold text-slate-800">Recipient:</span>
              <p className="mt-0.5 text-slate-500">Configured in .env (SANDBOX_PERSONAL_EMAIL / Fictional Client)</p>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-3">
            <button
              onClick={handleRunTest}
              disabled={loading}
              className={`w-full inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-sm transition ${
                loading
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              }`}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    ></path>
                  </svg>
                  Processing with PayPal Sandbox...
                </span>
              ) : (
                "Run Stage 1 Test: Create, Send & Fetch Sandbox Invoice"
              )}
            </button>
          </div>
        </div>

        {/* Loading State Skeleton */}
        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-1/3"></div>
            <div className="space-y-2">
              <div className="h-3 bg-slate-100 rounded w-full"></div>
              <div className="h-3 bg-slate-100 rounded w-5/6"></div>
              <div className="h-3 bg-slate-100 rounded w-4/6"></div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-5">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 001.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-semibold text-red-800">
                  PayPal Integration Test Failed
                </h3>
                <div className="mt-2 text-xs text-red-700 whitespace-pre-wrap font-mono">
                  {error}
                </div>
                <div className="mt-3 text-xs text-red-600">
                  Please verify your <code className="bg-red-100 px-1 py-0.5 rounded">.env</code> values
                  for PAYPAL_CLIENT_ID and PAYPAL_SECRET.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !result && !error && (
          <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-300 bg-white/50">
            <svg
              className="mx-auto h-10 w-10 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-3 text-sm font-semibold text-slate-800">No test run yet</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Click the button above to execute the automated Stage 1 test against PayPal Sandbox.
            </p>
          </div>
        )}

        {/* Success / Result State */}
        {result && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-emerald-200 overflow-hidden">
              {/* Status Header */}
              <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-sm font-semibold text-emerald-900">
                    Test Completed Successfully!
                  </span>
                </div>
                <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                  Status: {result.status || "SENT"}
                </span>
              </div>

              {/* Summary Cards */}
              <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-100">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-xs text-slate-500">Invoice ID</div>
                  <div className="mt-1 text-sm font-mono font-semibold text-slate-900 truncate" title={result.invoiceId}>
                    {result.invoiceId}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-xs text-slate-500">Invoice Amount</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    ${result.amount?.value || "150.00"} {result.amount?.currency_code || "USD"}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-xs text-slate-500">Recipient</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 truncate" title={result.recipient}>
                    {result.recipient}
                  </div>
                </div>
              </div>

              {/* Execution Steps Log */}
              <div className="p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-4">
                  Execution Step Audit
                </h3>
                <div className="space-y-3">
                  {result.steps?.map((step, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg text-xs flex items-start gap-3 ${
                        step.status === "warning"
                          ? "bg-amber-50 border border-amber-200 text-amber-900"
                          : "bg-slate-50 border border-slate-200 text-slate-800"
                      }`}
                    >
                      <div className="mt-0.5">
                        {step.status === "warning" ? (
                          <span className="text-amber-500 font-bold">&#9888;</span>
                        ) : (
                          <span className="text-emerald-500 font-bold">&#10003;</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold">{step.step}</div>
                        <div className="mt-0.5 text-slate-600">{step.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Collapsible Full JSON */}
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setShowJson(!showJson)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-500 flex items-center gap-1"
                  >
                    <span>{showJson ? "Hide" : "Show"} Full PayPal Response Payload</span>
                    <span>{showJson ? "▲" : "▼"}</span>
                  </button>

                  {showJson && (
                    <pre className="mt-3 p-4 bg-slate-900 text-slate-100 rounded-lg text-xs overflow-x-auto max-h-96">
                      {JSON.stringify(result.invoice, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
