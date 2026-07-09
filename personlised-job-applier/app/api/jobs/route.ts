import { NextResponse } from "next/server";

import { readJobsState } from "@/lib/jobs/store";

export async function GET() {
  const state = await readJobsState();
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
