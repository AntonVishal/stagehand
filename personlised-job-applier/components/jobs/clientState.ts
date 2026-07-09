import type { JobApplication, JobLog, JobsState } from "@/lib/jobs/types";

export type BusyState =
  | { action: "discover" | "refresh" }
  | { action: "run"; ids: string[]; current?: string }
  | null;

export type JobCounts = {
  urls: number;
  selected: number;
  review: number;
  failed: number;
};

export function replaceJob(state: JobsState, job: JobApplication): JobsState {
  return {
    ...state,
    jobs: state.jobs.map((item) => (item.id === job.id ? job : item)),
  };
}

export function withClientLog(
  state: JobsState,
  level: JobLog["level"],
  message: string,
  jobId?: string,
): JobsState {
  return {
    ...state,
    logs: [
      {
        id: `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        jobId,
        level,
        message,
        createdAt: new Date().toISOString(),
      },
      ...(state.logs ?? []),
    ].slice(0, 300),
  };
}
