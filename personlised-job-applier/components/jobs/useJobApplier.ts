"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type BusyState,
  type JobCounts,
  replaceJob,
  withClientLog,
} from "@/components/jobs/clientState";
import {
  JOB_SITES,
  type JobApplication,
  type JobSource,
  type JobsState,
} from "@/lib/jobs/types";

export function useJobApplier() {
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

  const counts: JobCounts = useMemo(
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
      setSelectedIds((current) => keepExistingSelection(current, next.jobs));
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
    setBusy(runBusyState(queue, queue[0]?.id));

    for (const job of queue) {
      setBusy(runBusyState(queue, job.id));
      setState((current) =>
        current
          ? withClientLog(
              current,
              "info",
              `Running ${job.company} - ${job.role}`,
              job.id,
            )
          : current,
      );

      try {
        const res = await fetch(`/api/jobs/${job.id}/run`, { method: "POST" });
        const payload = (await res.json()) as {
          job?: JobApplication;
          state?: JobsState;
          error?: string;
        };
        if (!res.ok || !payload.job) {
          throw new Error(payload.error ?? "Run failed");
        }
        setState(
          (current) =>
            payload.state ??
            (current ? replaceJob(current, payload.job!) : current),
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "Run failed";
        setError(message);
        setState((current) =>
          current
            ? withClientLog(
                current,
                "error",
                `${job.company}: ${message}`,
                job.id,
              )
            : current,
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

  const toggleSite = (source: JobSource) => {
    setSelectedSites((current) =>
      current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source],
    );
  };

  return {
    allSelected,
    busy,
    counts,
    discover,
    error,
    jobLimit,
    jobs,
    loadJobs,
    logs,
    roleQuery,
    runSelected,
    runtime,
    selectedIds,
    selectedSites,
    setJobLimit,
    setRoleQuery,
    toggleAll,
    toggleOne,
    toggleSite,
  };
}

function keepExistingSelection(
  selectedIds: Set<string>,
  jobs: JobApplication[],
) {
  return new Set(
    [...selectedIds].filter((id) => jobs.some((job) => job.id === id)),
  );
}

function runBusyState(jobs: JobApplication[], current?: string): BusyState {
  return {
    action: "run",
    ids: jobs.map((job) => job.id),
    current,
  };
}
