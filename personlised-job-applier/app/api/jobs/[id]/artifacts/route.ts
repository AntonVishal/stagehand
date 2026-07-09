import { NextResponse } from "next/server";

import { getJob } from "@/lib/jobs/store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job)
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(
    { artifacts: job.artifacts },
    { headers: { "Cache-Control": "no-store" } },
  );
}
