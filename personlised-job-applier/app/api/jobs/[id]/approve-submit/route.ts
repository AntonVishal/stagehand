import { NextResponse } from "next/server";

import { getJob, readJobsState } from "@/lib/jobs/store";
import { approveAndSubmit } from "@/lib/jobs/stagehandRunner";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job)
    return NextResponse.json({ error: "Job not found" }, { status: 404 });

  try {
    const updated = await approveAndSubmit(job);
    const state = await readJobsState();
    return NextResponse.json(
      { job: updated, state },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Submit approval failed",
      },
      { status: 400 },
    );
  }
}
