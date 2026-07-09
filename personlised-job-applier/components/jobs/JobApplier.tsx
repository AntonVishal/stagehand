"use client";

import { JobSearchPanel } from "@/components/jobs/JobSearchPanel";
import { JobTable } from "@/components/jobs/JobTable";
import { LiveLogPanel } from "@/components/jobs/LiveLogPanel";
import { MetricCard } from "@/components/jobs/MetricCard";
import { useJobApplier } from "@/components/jobs/useJobApplier";

export function JobApplier() {
  const jobApplier = useJobApplier();
  const {
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
  } = jobApplier;

  return (
    <main className="mx-auto max-w-[1760px] px-5 py-6">
      <header className="mb-5">
        <JobSearchPanel
          busy={busy}
          jobLimit={jobLimit}
          roleQuery={roleQuery}
          selectedSites={selectedSites}
          onDiscover={discover}
          onRefresh={() => void loadJobs({ action: "refresh" })}
          onRoleQueryChange={setRoleQuery}
          onJobLimitChange={setJobLimit}
          onToggleSite={toggleSite}
        />
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
        <MetricCard label="URLs found" value={counts.urls} />
        <MetricCard label="Selected" value={counts.selected} />
        <MetricCard label="Resume Submitted" value={counts.review} />
        <MetricCard
          label="Errors"
          value={counts.failed}
          tone={counts.failed ? "error" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <JobTable
          allSelected={allSelected}
          busy={busy}
          canRun={runtime?.canRunApplications ?? false}
          jobs={jobs}
          selectedIds={selectedIds}
          onRunSelected={runSelected}
          onToggleAll={toggleAll}
          onToggleOne={toggleOne}
        />
        <LiveLogPanel logs={logs} busy={busy} />
      </div>
    </main>
  );
}
