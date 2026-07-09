import {
  CheckSquare,
  ExternalLink,
  FileCode2,
  Loader2,
  Play,
  Square,
  Upload,
} from "lucide-react";

import type { BusyState } from "@/components/jobs/clientState";
import { StatusBadge } from "@/components/jobs/StatusBadge";
import { Card, CardHeader } from "@/components/ui/Card";
import type { JobApplication } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

type JobTableProps = {
  allSelected: boolean;
  busy: BusyState;
  canRun: boolean;
  jobs: JobApplication[];
  selectedIds: Set<string>;
  onRunSelected: () => void;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
};

export function JobTable({
  allSelected,
  busy,
  canRun,
  jobs,
  selectedIds,
  onRunSelected,
  onToggleAll,
  onToggleOne,
}: JobTableProps) {
  return (
    <Card>
      <CardHeader
        title="Found Jobs"
        subtitle="Select the URLs you want to process. The agent runs them one by one and logs every stage."
        right={
          <JobTableActions
            allSelected={allSelected}
            busy={busy}
            canRun={canRun}
            jobsCount={jobs.length}
            selectedCount={selectedIds.size}
            onRunSelected={onRunSelected}
            onToggleAll={onToggleAll}
          />
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
              jobs.map((job) => (
                <JobRow
                  key={job.id}
                  busy={busy}
                  job={job}
                  selected={selectedIds.has(job.id)}
                  onToggle={() => onToggleOne(job.id)}
                />
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
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

function JobTableActions({
  allSelected,
  busy,
  canRun,
  jobsCount,
  selectedCount,
  onRunSelected,
  onToggleAll,
}: {
  allSelected: boolean;
  busy: BusyState;
  canRun: boolean;
  jobsCount: number;
  selectedCount: number;
  onRunSelected: () => void;
  onToggleAll: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggleAll}
        disabled={!jobsCount || busy !== null}
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
  );
}

function JobRow({
  busy,
  job,
  selected,
  onToggle,
}: {
  busy: BusyState;
  job: JobApplication;
  selected: boolean;
  onToggle: () => void;
}) {
  const running = busy?.action === "run" && busy.current === job.id;

  return (
    <tr
      className={cn(
        "border-b border-border-faint transition-colors hover:bg-bg-layered",
        selected && "bg-primary/5",
        running && "bg-alert/10",
      )}
    >
      <td className="px-5 py-4">
        <button
          onClick={onToggle}
          disabled={busy !== null}
          className="rounded p-1 text-text-secondary hover:bg-bg-top hover:text-primary disabled:opacity-40"
          aria-label={selected ? "Unselect job" : "Select job"}
        >
          {selected ? <CheckSquare size={16} /> : <Square size={16} />}
        </button>
      </td>
      <td className="px-3 py-4">
        <div className="max-w-[460px]">
          <div className="font-medium text-text-primary">{job.company}</div>
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
        <JobArtifacts job={job} />
      </td>
    </tr>
  );
}

function JobArtifacts({ job }: { job: JobApplication }) {
  const resumeArtifacts = job.artifacts.filter(
    (artifact) => artifact.kind === "resume",
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {resumeArtifacts.map((artifact) => (
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
  );
}
