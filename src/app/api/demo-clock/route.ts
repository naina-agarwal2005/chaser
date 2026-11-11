import { NextResponse } from "next/server";
import { getClockOffsetDays, setClockOffsetDays } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("advanceDays" in body || "reset" in body)
  ) {
    return NextResponse.json(
      { success: false, error: "Provide advanceDays or reset." },
      { status: 400 }
    );
  }

  if ("reset" in body && body.reset === true) {
    setClockOffsetDays(0);
    return NextResponse.json({ success: true, clockOffsetDays: 0 });
  }

  const advanceDays = "advanceDays" in body ? body.advanceDays : undefined;
  if (typeof advanceDays !== "number" || !Number.isInteger(advanceDays) || advanceDays <= 0 || advanceDays > 3650) {
    return NextResponse.json(
      { success: false, error: "advanceDays must be an integer from 1 to 3650." },
      { status: 400 }
    );
  }

  const clockOffsetDays = getClockOffsetDays() + advanceDays;
  setClockOffsetDays(clockOffsetDays);
  return NextResponse.json({ success: true, clockOffsetDays });
}
