import { NextResponse } from "next/server";
import { getAllInvoices } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const invoices = getAllInvoices();
    return NextResponse.json({ success: true, invoices });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}
