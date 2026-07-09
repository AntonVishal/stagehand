import { NextResponse } from "next/server";

import { discoverJobs } from "@/lib/jobs/discovery";
import { JOB_SITES, type JobSource } from "@/lib/jobs/types";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    roleQuery?: string;
    sites?: string[];
    limit?: number;
  };
  const validSites = new Set<JobSource>(JOB_SITES.map((site) => site.source));
  const state = await discoverJobs({
    roleQuery: body.roleQuery,
    limit: body.limit,
    sites: body.sites?.filter((site): site is JobSource =>
      validSites.has(site as JobSource),
    ),
  });
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
