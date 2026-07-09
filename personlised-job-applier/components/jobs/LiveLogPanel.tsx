import { Loader2, Terminal } from "lucide-react";

import type { BusyState } from "@/components/jobs/clientState";
import { Card } from "@/components/ui/Card";
import type { JobLog } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

export function LiveLogPanel({
  busy,
  logs,
}: {
  busy: BusyState;
  logs: JobLog[];
}) {
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
          <LogStatus busy={busy} />
        </div>
        <div className="max-h-[620px] space-y-2 overflow-auto p-4 font-mono type-caption">
          {logs.length ? (
            logs.map((log) => <LogEntry key={log.id} log={log} />)
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

function LogStatus({ busy }: { busy: BusyState }) {
  return (
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
  );
}

function LogEntry({ log }: { log: JobLog }) {
  return (
    <div
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
  );
}
