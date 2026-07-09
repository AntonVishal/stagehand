import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  Artifact,
  JobApplication,
  JobLog,
  JobsState,
  JobStatus,
} from "@/lib/jobs/types";

const DATA_DIR = path.join(process.cwd(), ".job-agent");
const STORE_PATH = path.join(DATA_DIR, "jobs.json");
const STORE_TMP_PATH = path.join(DATA_DIR, "jobs.json.tmp");

const DEFAULT_STATE: JobsState = {
  defaultRoleQuery: process.env.DEFAULT_ROLE_QUERY ?? "Product Engineer",
  jobs: [],
  logs: [],
  runtime: runtimeState(),
};

let storeLock: Promise<void> = Promise.resolve();

async function withStoreLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = storeLock.then(operation, operation);
  storeLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
}

function runtimeState() {
  const required = [
    "BROWSERBASE_API_KEY",
    "BROWSERBASE_PROJECT_ID",
    "AI_GATEWAY_API_KEY",
  ];
  const missingEnv = required.filter((key) => !process.env[key]);
  return {
    canRunApplications: missingEnv.length === 0,
    missingEnv,
  };
}

function sortState(state: JobsState): JobsState {
  return {
    ...state,
    runtime: runtimeState(),
    jobs: [...state.jobs].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    logs: [...(state.logs ?? [])]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 300),
  };
}

async function readJobsStateUnlocked(): Promise<JobsState> {
  await ensureStore();
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return {
      ...DEFAULT_STATE,
      ...JSON.parse(raw),
      runtime: runtimeState(),
    } as JobsState;
  } catch {
    const sorted = sortState(DEFAULT_STATE);
    await writeJobsStateUnlocked(sorted);
    return sorted;
  }
}

async function writeJobsStateUnlocked(state: JobsState): Promise<JobsState> {
  await ensureStore();
  const sorted = sortState(state);
  await writeFile(STORE_TMP_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  await rename(STORE_TMP_PATH, STORE_PATH);
  return sorted;
}

export async function readJobsState(): Promise<JobsState> {
  return withStoreLock(readJobsStateUnlocked);
}

export async function writeJobsState(state: JobsState): Promise<JobsState> {
  return withStoreLock(() => writeJobsStateUnlocked(state));
}

export async function upsertJobs(
  incoming: JobApplication[],
): Promise<JobsState> {
  return withStoreLock(async () => {
    const state = await readJobsStateUnlocked();
    const byUrl = new Map(
      state.jobs.map((job) => [normaliseUrl(job.url), job]),
    );
    const byId = new Map(state.jobs.map((job) => [job.id, job]));

    for (const job of incoming) {
      const existing = byId.get(job.id) ?? byUrl.get(normaliseUrl(job.url));
      const merged = existing
        ? {
            ...existing,
            ...job,
            artifacts: existing.artifacts.length
              ? existing.artifacts
              : job.artifacts,
            questions: existing.questions.length
              ? existing.questions
              : job.questions,
            createdAt: existing.createdAt,
            updatedAt: new Date().toISOString(),
          }
        : job;
      byId.set(merged.id, merged);
      byUrl.set(normaliseUrl(merged.url), merged);
    }

    return writeJobsStateUnlocked({
      ...state,
      jobs: Array.from(byId.values()),
    });
  });
}

export async function getJob(id: string): Promise<JobApplication | null> {
  const state = await readJobsState();
  return state.jobs.find((job) => job.id === id) ?? null;
}

export async function updateJob(
  id: string,
  patch: Partial<Omit<JobApplication, "id" | "createdAt">> & {
    status?: JobStatus;
    artifacts?: Artifact[];
  },
): Promise<JobApplication> {
  return withStoreLock(async () => {
    const state = await readJobsStateUnlocked();
    const index = state.jobs.findIndex((job) => job.id === id);
    if (index === -1) throw new Error(`Unknown job: ${id}`);

    const next: JobApplication = {
      ...state.jobs[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const jobs = [...state.jobs];
    jobs[index] = next;
    await writeJobsStateUnlocked({ ...state, jobs });
    return next;
  });
}

export async function appendJobLog(
  log: Omit<JobLog, "id" | "createdAt">,
): Promise<JobLog> {
  return withStoreLock(async () => {
    const state = await readJobsStateUnlocked();
    const createdAt = new Date().toISOString();
    const next: JobLog = {
      ...log,
      id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt,
    };
    await writeJobsStateUnlocked({
      ...state,
      logs: [next, ...(state.logs ?? [])],
    });
    return next;
  });
}

function normaliseUrl(url: string) {
  return url.replace(/\/+$/, "").toLowerCase();
}
