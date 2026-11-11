import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chaser - Stage 1 PayPal Integration Test",
  description: "PayPal Invoicing API sandbox test for Chaser",
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
