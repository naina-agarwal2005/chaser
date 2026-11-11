import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chaser - Deal and Invoice Tracker",
  description: "Extract client deals and track PayPal sandbox invoices.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
