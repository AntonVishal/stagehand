import { NextResponse } from "next/server";

import { getJob, readJobsState } from "@/lib/jobs/store";
import { runApplicationToReview } from "@/lib/jobs/stagehandRunner";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job)
    return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const updated = await runApplicationToReview(job);
  const state = await readJobsState();
  return NextResponse.json(
    { job: updated, state },
    { headers: { "Cache-Control": "no-store" } },
  );
}
