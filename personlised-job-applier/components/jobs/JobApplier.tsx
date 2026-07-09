"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckSquare,
  ExternalLink,
  FileCode2,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Square,
  Terminal,
  Upload,
} from "lucide-react";

import { StatusBadge } from "@/components/jobs/StatusBadge";
import { Card, CardHeader } from "@/components/ui/Card";
import {
  JOB_SITES,
  type JobApplication,
  type JobLog,
  type JobSource,
  type JobsState,
} from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

type BusyState =
  | { action: "discover" | "refresh" }
  | { action: "run"; ids: string[]; current?: string }
  | null;

export function JobApplier() {
  const [state, setState] = useState<JobsState | null>(null);
  const [roleQuery, setRoleQuery] = useState("Product Engineer");
  const [selectedSites, setSelectedSites] = useState<JobSource[]>(
    JOB_SITES.map((site) => site.source),
  );
  const [jobLimit, setJobLimit] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);

  const jobs = useMemo(() => state?.jobs ?? [], [state]);
  const logs = useMemo(() => state?.logs ?? [], [state]);
  const runtime = state?.runtime;
  const allSelected = jobs.length > 0 && selectedIds.size === jobs.length;
  const runnableSelected = jobs.filter(
    (job) => selectedIds.has(job.id) && job.status !== "submitted",
  );

  const counts = useMemo(
    () => ({
      urls: jobs.length,
      selected: selectedIds.size,
      review: jobs.filter((job) => job.status === "needs_review").length,
      failed: jobs.filter((job) => job.status === "failed").length,
    }),
    [jobs, selectedIds.size],
  );

  const loadJobs = useCallback(async (action: BusyState = null) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      const next = (await res.json()) as JobsState;
      setState(next);
      setRoleQuery((current) => current || next.defaultRoleQuery);
      setSelectedIds(
        (current) =>
          new Set(
            [...current].filter((id) => next.jobs.some((job) => job.id === id)),
          ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load jobs");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadJobs({ action: "refresh" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadJobs]);

  const discover = async () => {
    setBusy({ action: "discover" });
    setError(null);
    try {
      const res = await fetch("/api/jobs/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleQuery,
          sites: selectedSites,
          limit: jobLimit,
        }),
      });
      const next = (await res.json()) as JobsState;
      setState(next);
      setSelectedIds(new Set(next.jobs.map((job) => job.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setBusy(null);
    }
  };

  const runSelected = async () => {
    const queue = runnableSelected;
    if (!queue.length) return;
    setError(null);
    setBusy({
      action: "run",
      ids: queue.map((job) => job.id),
      current: queue[0]?.id,
    });

    for (const job of queue) {
      setBusy({
        action: "run",
        ids: queue.map((item) => item.id),
        current: job.id,
      });
      setState(
        (current) =>
          current &&
          withClientLog(
            current,
            "info",
            `Running ${job.company} - ${job.role}`,
            job.id,
          ),
      );
      try {
        const res = await fetch(`/api/jobs/${job.id}/run`, { method: "POST" });
        const payload = (await res.json()) as {
          job?: JobApplication;
          state?: JobsState;
          error?: string;
        };
        if (!res.ok || !payload.job)
          throw new Error(payload.error ?? "Run failed");
        setState(
          (current) =>
            payload.state ??
            (current ? replaceJob(current, payload.job!) : current),
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "Run failed";
        setError(message);
        setState(
          (current) =>
            current &&
            withClientLog(
              current,
              "error",
              `${job.company}: ${message}`,
              job.id,
            ),
        );
      }
    }

    setBusy(null);
  };

  const toggleAll = () => {
    setSelectedIds(
      allSelected ? new Set() : new Set(jobs.map((job) => job.id)),
    );
  };

  const toggleOne = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="mx-auto max-w-[1760px] px-5 py-6">
      <header className="mb-5">
        <Card className="p-0">
          <div className="grid grid-cols-1 gap-0 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="border-b border-border-faint p-5 xl:border-b-0 xl:border-r">
              <p className="type-caption font-mono uppercase tracking-wide text-text-tertiary">
                Stagehand · Browserbase
              </p>
              <h1 className="type-title mt-2 text-text-primary">
                Personalised Job Applier
              </h1>
              <p className="mt-3 type-body text-text-secondary">
                Search job boards, select URLs, then run tailored form
                automation with live logs.
              </p>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,1fr)_auto] lg:items-start">
                <div>
                  <label
                    className="type-caption text-text-tertiary"
                    htmlFor="role-query"
                  >
                    Job role / search text
                  </label>
                  <div className="mt-2 flex items-start gap-2 rounded-md border border-border-solid bg-bg-subtle p-2">
                    <Search size={15} className="mt-2 text-text-tertiary" />
                    <textarea
                      id="role-query"
                      value={roleQuery}
                      onChange={(e) => setRoleQuery(e.target.value)}
                      className="min-h-14 flex-1 resize-y bg-transparent px-1 py-1.5 type-body text-text-primary outline-none placeholder:text-text-tertiary"
                      placeholder="Product Engineer"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:min-w-[230px] lg:justify-end lg:pt-6">
                  <button
                    onClick={discover}
                    disabled={
                      busy !== null ||
                      selectedSites.length === 0 ||
                      !roleQuery.trim()
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary px-3 py-2 type-body text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy?.action === "discover" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Bot size={14} />
                    )}
                    Search jobs
                  </button>
                  <button
                    onClick={() => void loadJobs({ action: "refresh" })}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-solid bg-bg-top px-3 py-2 type-body text-text-primary transition-colors hover:bg-bg-layered disabled:opacity-50"
                  >
                    <RefreshCw
                      size={14}
                      className={
                        busy?.action === "refresh" ? "animate-spin" : undefined
                      }
                    />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {JOB_SITES.map((site) => {
                  const checked = selectedSites.includes(site.source);
                  return (
                    <label
                      key={site.source}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 type-caption transition-colors",
                        checked
                          ? "border-primary bg-primary/10 text-text-primary"
                          : "border-border-solid bg-bg-top text-text-tertiary hover:bg-bg-layered",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedSites((current) =>
                            current.includes(site.source)
                              ? current.filter(
                                  (source) => source !== site.source,
                                )
                              : [...current, site.source],
                          );
                        }}
                        className="size-3 accent-primary"
                      />
                      {site.label}
                    </label>
                  );
                })}
                <label className="ml-auto flex items-center gap-2 type-caption text-text-tertiary">
                  Limit
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={jobLimit}
                    onChange={(e) => setJobLimit(Number(e.target.value))}
                    className="w-20 rounded-md border border-border-solid bg-bg-top px-2 py-1.5 font-mono text-text-primary outline-none focus:border-primary"
                  />
                </label>
              </div>

              <div className="mt-3 overflow-hidden rounded-md border border-border-faint bg-bg-top px-3 py-2">
                <p className="type-caption text-text-tertiary">Queries</p>
                <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
                  {JOB_SITES.filter((site) =>
                    selectedSites.includes(site.source),
                  ).map((site) => (
                    <code
                      key={site.source}
                      className="shrink-0 rounded border border-border-faint bg-bg-subtle px-2 py-1 type-caption text-text-secondary"
                    >
                      site:{site.site} {roleQuery || "Product Engineer"}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </header>

      {error ? (
        <div className="mb-5 rounded-md border border-error/30 bg-error/10 px-4 py-3 type-body text-error">
          {error}
        </div>
      ) : null}

      {runtime && !runtime.canRunApplications ? (
        <div className="mb-5 rounded-md border border-error/30 bg-error/10 px-4 py-3 type-body text-error">
          Application runs are blocked. Missing environment variables:{" "}
          <span className="font-mono">{runtime.missingEnv.join(", ")}</span>
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="URLs found" value={counts.urls} />
        <Metric label="Selected" value={counts.selected} />
        <Metric label="Resume Submitted" value={counts.review} />
        <Metric
          label="Errors"
          value={counts.failed}
          tone={counts.failed ? "error" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <JobTable
          jobs={jobs}
          selectedIds={selectedIds}
          allSelected={allSelected}
          busy={busy}
          canRun={runtime?.canRunApplications ?? false}
          onToggleAll={toggleAll}
          onToggleOne={toggleOne}
          onRunSelected={runSelected}
        />
        <LiveLogPanel logs={logs} busy={busy} />
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "error";
}) {
  return (
    <Card className="p-4">
      <p className="type-caption text-text-tertiary">{label}</p>
      <p
        className={cn(
          "mt-2 text-[28px] font-semibold leading-none tabular-nums",
          tone === "error" ? "text-error" : "text-text-primary",
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function JobTable({
  jobs,
  selectedIds,
  allSelected,
  busy,
  canRun,
  onToggleAll,
  onToggleOne,
  onRunSelected,
}: {
  jobs: JobApplication[];
  selectedIds: Set<string>;
  allSelected: boolean;
  busy: BusyState;
  canRun: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onRunSelected: () => void;
}) {
  const selectedCount = selectedIds.size;

  return (
    <Card>
      <CardHeader
        title="Found Jobs"
        subtitle="Select the URLs you want to process. The agent runs them one by one and logs every stage."
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleAll}
              disabled={!jobs.length || busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-solid bg-bg-top px-2.5 py-1.5 type-caption text-text-primary hover:bg-bg-layered disabled:opacity-50"
            >
              {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
              {allSelected ? "Clear" : "Select all"}
            </button>
            <button
              onClick={onRunSelected}
              disabled={!selectedCount || busy !== null || !canRun}
              title={
                canRun
                  ? "Run selected jobs"
                  : "Set BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, and AI_GATEWAY_API_KEY"
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary px-2.5 py-1.5 type-caption text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy?.action === "run" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Upload size={13} />
              )}
              Run selected
            </button>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="border-b border-border-faint bg-bg-subtle text-left type-caption text-text-tertiary">
              <th className="w-12 px-5 py-3 font-medium">Pick</th>
              <th className="px-3 py-3 font-medium">Job URL</th>
              <th className="px-3 py-3 font-medium">Source</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Artifacts</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length ? (
              jobs.map((job) => {
                const selected = selectedIds.has(job.id);
                const running =
                  busy?.action === "run" && busy.current === job.id;
                return (
                  <tr
                    key={job.id}
                    className={cn(
                      "border-b border-border-faint transition-colors hover:bg-bg-layered",
                      selected && "bg-primary/5",
                      running && "bg-alert/10",
                    )}
                  >
                    <td className="px-5 py-4">
                      <button
                        onClick={() => onToggleOne(job.id)}
                        disabled={busy !== null}
                        className="rounded p-1 text-text-secondary hover:bg-bg-top hover:text-primary disabled:opacity-40"
                        aria-label={selected ? "Unselect job" : "Select job"}
                      >
                        {selected ? (
                          <CheckSquare size={16} />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-4">
                      <div className="max-w-[460px]">
                        <div className="font-medium text-text-primary">
                          {job.company}
                        </div>
                        <div className="mt-1 truncate type-caption text-text-tertiary">
                          {job.role}
                        </div>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-mono type-caption text-active hover:text-primary"
                        >
                          <ExternalLink size={12} />
                          <span className="truncate">{job.url}</span>
                        </a>
                      </div>
                    </td>
                    <td className="px-3 py-4 type-body text-text-secondary">
                      {job.sourceLabel}
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {job.artifacts
                          .filter((artifact) => artifact.kind === "resume")
                          .map((artifact) => (
                            <a
                              key={`${artifact.kind}-${artifact.path}`}
                              href={artifact.href}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-border-faint px-1.5 py-1 type-caption text-text-secondary hover:bg-bg-top hover:text-primary"
                              title={artifact.label}
                            >
                              <FileCode2 size={11} />
                              resume
                            </a>
                          ))}
                        {job.replayUrl ? (
                          <a
                            href={job.replayUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-border-faint px-1.5 py-1 type-caption text-text-secondary hover:bg-bg-top hover:text-primary"
                          >
                            <Play size={11} />
                            replay
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-16 text-center type-body text-text-tertiary"
                >
                  Search for a role, select sites, and the discovered job URLs
                  will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LiveLogPanel({ logs, busy }: { logs: JobLog[]; busy: BusyState }) {
  return (
    <aside className="xl:sticky xl:top-5 xl:self-start">
      <Card className="min-h-[560px]">
        <div className="flex items-start justify-between gap-3 border-b border-border-faint px-5 py-4">
          <div>
            <h2 className="type-header text-text-primary">Live Logs</h2>
            <p className="type-caption mt-1 text-text-tertiary">
              Search, extraction, tailoring, upload, and errors.
            </p>
          </div>
          <div className="shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded border border-border-faint bg-bg-subtle px-2 py-1 type-caption text-text-secondary">
              {busy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Terminal size={12} />
              )}
              {busy?.action === "run" ? "running" : (busy?.action ?? "idle")}
            </span>
          </div>
        </div>
        <div className="max-h-[620px] space-y-2 overflow-auto p-4 font-mono type-caption">
          {logs.length ? (
            logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "rounded border p-2",
                  log.level === "error"
                    ? "border-error/25 bg-error/10"
                    : log.level === "success"
                      ? "border-success/25 bg-success/10"
                      : "border-border-faint bg-bg-subtle",
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-text-tertiary">
                  <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                  <span
                    className={cn(
                      log.level === "error"
                        ? "text-error"
                        : log.level === "success"
                          ? "text-success"
                          : "text-text-tertiary",
                    )}
                  >
                    {log.level}
                  </span>
                </div>
                <p className="text-text-primary">{log.message}</p>
              </div>
            ))
          ) : (
            <p className="rounded border border-border-faint bg-bg-subtle p-3 text-text-tertiary">
              Logs will appear here as soon as you search or run selected jobs.
            </p>
          )}
        </div>
      </Card>
    </aside>
  );
}

function replaceJob(state: JobsState, job: JobApplication): JobsState {
  return {
    ...state,
    jobs: state.jobs.map((item) => (item.id === job.id ? job : item)),
  };
}

function withClientLog(
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
