import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">Chaser</h1>
        <p className="text-sm text-slate-600 mb-6">
          Stage 1: Next.js scaffold & PayPal Sandbox Invoicing API integration.
        </p>
        <Link
          href="/test"
          className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition"
        >
          Go to /test Page &rarr;
        </Link>
      </div>
    </main>
  );
}
