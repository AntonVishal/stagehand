import { Bot, Loader2, RefreshCw, Search } from "lucide-react";

import type { BusyState } from "@/components/jobs/clientState";
import { Card } from "@/components/ui/Card";
import { JOB_SITES, type JobSource } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

type JobSearchPanelProps = {
  busy: BusyState;
  jobLimit: number;
  roleQuery: string;
  selectedSites: JobSource[];
  onDiscover: () => void;
  onRefresh: () => void;
  onRoleQueryChange: (value: string) => void;
  onJobLimitChange: (value: number) => void;
  onToggleSite: (source: JobSource) => void;
};

export function JobSearchPanel({
  busy,
  jobLimit,
  roleQuery,
  selectedSites,
  onDiscover,
  onRefresh,
  onRoleQueryChange,
  onJobLimitChange,
  onToggleSite,
}: JobSearchPanelProps) {
  return (
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
            Search job boards, select URLs, then run tailored form automation
            with live logs.
          </p>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,1fr)_auto] lg:items-start">
            <RoleQueryInput value={roleQuery} onChange={onRoleQueryChange} />
            <div className="flex flex-wrap gap-2 lg:min-w-[230px] lg:justify-end lg:pt-6">
              <button
                onClick={onDiscover}
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
                onClick={onRefresh}
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

          <DiscoveryControls
            jobLimit={jobLimit}
            roleQuery={roleQuery}
            selectedSites={selectedSites}
            onJobLimitChange={onJobLimitChange}
            onToggleSite={onToggleSite}
          />
        </div>
      </div>
    </Card>
  );
}

function RoleQueryInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="type-caption text-text-tertiary" htmlFor="role-query">
        Job role / search text
      </label>
      <div className="mt-2 flex items-start gap-2 rounded-md border border-border-solid bg-bg-subtle p-2">
        <Search size={15} className="mt-2 text-text-tertiary" />
        <textarea
          id="role-query"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-14 flex-1 resize-y bg-transparent px-1 py-1.5 type-body text-text-primary outline-none placeholder:text-text-tertiary"
          placeholder="Product Engineer"
        />
      </div>
    </div>
  );
}

function DiscoveryControls({
  jobLimit,
  roleQuery,
  selectedSites,
  onJobLimitChange,
  onToggleSite,
}: {
  jobLimit: number;
  roleQuery: string;
  selectedSites: JobSource[];
  onJobLimitChange: (value: number) => void;
  onToggleSite: (source: JobSource) => void;
}) {
  return (
    <>
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
                onChange={() => onToggleSite(site.source)}
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
            onChange={(e) => onJobLimitChange(Number(e.target.value))}
            className="w-20 rounded-md border border-border-solid bg-bg-top px-2 py-1.5 font-mono text-text-primary outline-none focus:border-primary"
          />
        </label>
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-border-faint bg-bg-top px-3 py-2">
        <p className="type-caption text-text-tertiary">Queries</p>
        <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
          {JOB_SITES.filter((site) => selectedSites.includes(site.source)).map(
            (site) => (
              <code
                key={site.source}
                className="shrink-0 rounded border border-border-faint bg-bg-subtle px-2 py-1 type-caption text-text-secondary"
              >
                site:{site.site} {roleQuery || "Product Engineer"}
              </code>
            ),
          )}
        </div>
      </div>
    </>
  );
}
