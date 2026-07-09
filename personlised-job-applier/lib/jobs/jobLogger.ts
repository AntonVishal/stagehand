import type { JobLog } from "@/lib/jobs/types";
import { appendJobLog } from "@/lib/jobs/store";

export async function logJob(
  jobId: string,
  level: JobLog["level"],
  message: string,
) {
  const prefix = `[job-agent][job:${jobId}][${level}]`;
  if (level === "error") console.error(prefix, message);
  else console.log(prefix, message);
  await appendJobLog({ jobId, level, message });
}

export function createStagehandLogger(jobId: string) {
  return (line: { category?: string; message: string; level?: number }) => {
    const message = formatStagehandLog(line);
    if (!message) return;
    void logJob(jobId, line.level === 0 ? "error" : "info", message);
  };
}

function formatStagehandLog(line: {
  category?: string;
  message: string;
  level?: number;
}) {
  const message = line.message.trim();
  if (!message) return "";
  const category = line.category
    ? `[stagehand:${line.category}] `
    : "[stagehand] ";
  return `${category}${message}`;
}
