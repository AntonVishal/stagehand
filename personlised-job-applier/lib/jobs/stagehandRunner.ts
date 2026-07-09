import type { JobApplication, JobLog } from "@/lib/jobs/types";
import { appendJobLog, updateJob } from "@/lib/jobs/store";
import {
  generateApplicationArtifacts,
  preferredResumePath,
} from "@/lib/jobs/latex";
import { tailorForJob } from "@/lib/jobs/tailor";
import {
  createStagehandLlmClient,
  getGatewayBaseUrl,
  getGatewayModelId,
} from "@/lib/jobs/stagehandLlm";
import { z } from "zod";

type StagehandModule = typeof import("@browserbasehq/stagehand");

const JobExtractionSchema = z.object({
  company: z.string().optional(),
  role: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  questions: z.array(z.string()).default([]),
});

type StagehandInstance = InstanceType<StagehandModule["Stagehand"]>;
type LogLevel = JobLog["level"];
type JobExtraction = z.infer<typeof JobExtractionSchema>;

export async function runApplicationToReview(
  job: JobApplication,
): Promise<JobApplication> {
  let stagehand: StagehandInstance | null = null;
  let browserbaseSession: { sessionId?: string; replayUrl?: string } = {};

  await logJob(
    job.id,
    "info",
    `Starting ${job.sourceLabel} application: ${job.role} (${job.url})`,
  );
  if (!hasBrowserbaseEnv()) {
    const missing = missingRunEnv();
    const message = `Cannot run application automation. Missing env: ${missing.join(", ")}.`;
    await logJob(job.id, "error", message);
    return updateJob(job.id, {
      status: "failed",
      failureReason: message,
      lastAction: message,
    });
  }

  try {
    const { Stagehand } = await loadStagehand();
    await logJob(
      job.id,
      "info",
      `Creating Browserbase Stagehand session with model ${getGatewayModelId()} via ${getGatewayBaseUrl()}.`,
    );

    const stagehandLogger = createStagehandLogger(job.id);
    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      verbose: 1,
      disableAPI: true,
      disablePino: true,
      logInferenceToFile: true,
      cacheDir: ".job-agent/stagehand-cache",
      logger: stagehandLogger,
      llmClient: await createStagehandLlmClient(),
    });
    await stagehand.init();
    browserbaseSession = getBrowserbaseSession(stagehand);
    await logJob(
      job.id,
      "success",
      `Browserbase session ready${browserbaseSession.sessionId ? `: ${browserbaseSession.sessionId}` : ""}${browserbaseSession.replayUrl ? ` (${browserbaseSession.replayUrl})` : ""}.`,
    );

    const page = stagehand.context.pages()[0];
    await logJob(job.id, "info", `Opening job URL: ${job.url}`);
    const response = await page.goto(job.url, {
      waitUntil: "domcontentloaded",
      timeoutMs: 45000,
    });
    const status = response?.status();
    const finalUrl = page.url();
    const title = await page.title().catch(() => "");
    if (status && status >= 400) {
      throw new Error(
        `Job URL returned HTTP ${status}${response?.statusText() ? ` ${response.statusText()}` : ""}: ${finalUrl}`,
      );
    }
    await logJob(
      job.id,
      "success",
      `Opened job page${status ? ` (HTTP ${status})` : ""}${title ? `: ${title}` : ""} at ${finalUrl}.`,
    );
    await logJob(
      job.id,
      "info",
      "Extracting JD and application questions from the loaded page.",
    );

    const extracted = (await stagehand.extract(
      "Extract the job title, company, location, full job description, and all required application questions visible on this page.",
      JobExtractionSchema as never,
    )) as unknown as JobExtraction;
    const extractedJob = await updateJob(job.id, {
      company: extracted.company || job.company,
      role: extracted.role || job.role,
      location: extracted.location || job.location,
      description: extracted.description || job.description,
      questions: extracted.questions.map((prompt) => ({ prompt, answer: "" })),
      extractedAt: new Date().toISOString(),
      lastAction:
        "Extracted job description and required application questions with Stagehand.",
    });
    await logJob(
      job.id,
      "success",
      `Extracted ${extracted.company || job.company} - ${extracted.role || job.role}; ${extracted.description ? extracted.description.length : 0} JD chars; ${extracted.questions.length} question${extracted.questions.length === 1 ? "" : "s"}.`,
    );

    await logJob(
      job.id,
      "info",
      "Generating tailored answers and BasicTeX artifacts.",
    );
    const materialJob = await generateMaterials(extractedJob);
    const resumePath = preferredResumePath(materialJob.artifacts);
    await logJob(
      job.id,
      "success",
      `Generated ${materialJob.questions.length} answer${materialJob.questions.length === 1 ? "" : "s"} and ${materialJob.artifacts.length} artifact${materialJob.artifacts.length === 1 ? "" : "s"}.`,
    );

    await logJob(
      job.id,
      "info",
      "Filling application fields. Final submit remains blocked.",
    );
    await stagehand.act(
      `Fill the application form using these tailored answers. Do not click final submit.\n\n${JSON.stringify(
        {
          summary: materialJob.description,
          answers: materialJob.questions,
        },
      )}`,
    );
    await logJob(
      job.id,
      "success",
      "Filled visible application fields without clicking final submit.",
    );

    if (resumePath) {
      await logJob(job.id, "info", `Uploading resume PDF from ${resumePath}.`);
      await stagehand.act("upload %resume% to the resume or CV field", {
        variables: { resume: resumePath },
      });
      await logJob(job.id, "success", "Uploaded generated resume PDF.");
    } else {
      await logJob(
        job.id,
        "info",
        "No resume PDF was generated, so upload step was skipped.",
      );
    }

    await stagehand.close();
    stagehand = null;

    return updateJob(job.id, {
      status: "needs_review",
      replayUrl: browserbaseSession.replayUrl,
      sessionId: browserbaseSession.sessionId,
      lastAction:
        "Extracted JD/questions, generated custom materials, filled fields, uploaded resume, and stopped before final submit.",
    });
  } catch (error) {
    if (stagehand) {
      browserbaseSession = {
        ...browserbaseSession,
        ...getBrowserbaseSession(stagehand),
      };
      await stagehand.close().catch(() => undefined);
    }
    const message = formatError(error);
    await logJob(
      job.id,
      "error",
      `Run failed: ${message}${browserbaseSession.replayUrl ? ` (replay: ${browserbaseSession.replayUrl})` : ""}`,
    );
    return updateJob(job.id, {
      status: "failed",
      failureReason: message,
      replayUrl: browserbaseSession.replayUrl ?? job.replayUrl,
      sessionId: browserbaseSession.sessionId ?? job.sessionId,
      lastAction: `Stagehand run failed before reaching the approval gate: ${message}`,
    });
  }
}

async function generateMaterials(job: JobApplication) {
  const tailored = await tailorForJob(job);
  const artifacts = await generateApplicationArtifacts(
    job,
    tailored.questions,
    tailored.summary,
    tailored.additionalInstructions,
    tailored.tailoredResume,
  );
  const resumePath = preferredResumePath(artifacts);

  return updateJob(job.id, {
    status: "materials_generated",
    questions: tailored.questions,
    artifacts,
    description: tailored.summary,
    lastAction: resumePath
      ? "Generated custom answers and resume/cover-letter PDFs using BasicTeX."
      : "Generated custom answers and LaTeX files; BasicTeX did not produce a resume PDF.",
  });
}

export async function approveAndSubmit(
  job: JobApplication,
): Promise<JobApplication> {
  if (job.status !== "needs_review") {
    throw new Error("Only jobs waiting for review can be submitted.");
  }

  if (!hasBrowserbaseEnv()) {
    return updateJob(job.id, {
      status: "submitted",
      submittedAt: new Date().toISOString(),
      lastAction:
        "Demo approval recorded. Configure Browserbase credentials to click final submit in a hosted browser.",
    });
  }

  try {
    const { Stagehand } = await loadStagehand();
    const stagehandLogger = createStagehandLogger(job.id);
    const stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      verbose: 1,
      disableAPI: true,
      disablePino: true,
      logger: stagehandLogger,
      llmClient: await createStagehandLlmClient(),
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];
    await page.goto(job.url, { waitUntil: "load" });
    await stagehand.act("click the final submit application button");
    const browserbaseSession = getBrowserbaseSession(stagehand);
    await stagehand.close();

    return updateJob(job.id, {
      status: "submitted",
      submittedAt: new Date().toISOString(),
      replayUrl: browserbaseSession.replayUrl ?? job.replayUrl,
      sessionId: browserbaseSession.sessionId ?? job.sessionId,
      lastAction: "Human approved; Stagehand clicked the final submit button.",
    });
  } catch (error) {
    const message = formatError(error);
    await logJob(job.id, "error", `Submit failed: ${message}`);
    return updateJob(job.id, {
      status: "failed",
      failureReason: message,
      lastAction: "Submit attempt failed after approval.",
    });
  }
}

function hasBrowserbaseEnv() {
  return missingRunEnv().length === 0;
}

function missingRunEnv() {
  return [
    "BROWSERBASE_API_KEY",
    "BROWSERBASE_PROJECT_ID",
    "AI_GATEWAY_API_KEY",
  ].filter((key) => !process.env[key]);
}

async function loadStagehand(): Promise<StagehandModule> {
  const packageName =
    process.env.STAGEHAND_PACKAGE_NAME ?? "@browserbasehq/stagehand";
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<StagehandModule>;
  return dynamicImport(packageName);
}

function getBrowserbaseSession(stagehand: unknown): {
  sessionId?: string;
  replayUrl?: string;
} {
  const record = stagehand as Record<string, unknown>;
  const sessionId =
    typeof record.browserbaseSessionID === "string"
      ? record.browserbaseSessionID
      : undefined;
  return {
    sessionId,
    replayUrl: sessionId
      ? `https://www.browserbase.com/sessions/${sessionId}`
      : undefined,
  };
}

function createStagehandLogger(jobId: string) {
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

async function logJob(jobId: string, level: LogLevel, message: string) {
  const prefix = `[job-agent][job:${jobId}][${level}]`;
  if (level === "error") console.error(prefix, message);
  else console.log(prefix, message);
  await appendJobLog({ jobId, level, message });
}

function formatError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown Stagehand failure";

  const parts = [error.message];
  const httpDetails = extractHttpErrorDetails(error);
  if (httpDetails) parts.push(httpDetails);

  if (error.cause) {
    const causeMessage = formatErrorCause(error.cause);
    if (causeMessage) parts.push(`Cause: ${causeMessage}`);
  }

  return parts.join(" ");
}

function formatErrorCause(cause: unknown) {
  if (cause instanceof Error) {
    const httpDetails = extractHttpErrorDetails(cause);
    return httpDetails ? `${cause.message} (${httpDetails})` : cause.message;
  }
  if (typeof cause === "string" && cause.trim()) return cause;
  return "";
}

function extractHttpErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return "";

  const record = error as Record<string, unknown>;
  const statusCode =
    typeof record.statusCode === "number" ? record.statusCode : undefined;
  const url = typeof record.url === "string" ? record.url : undefined;
  const responseBody =
    typeof record.responseBody === "string" ? record.responseBody.trim() : "";

  if (!statusCode && !url && !responseBody) return "";

  const statusText =
    typeof record.statusText === "string" ? record.statusText : undefined;
  const statusLabel = statusCode
    ? `HTTP ${statusCode}${statusText ? ` ${statusText}` : ""}`
    : statusText || "HTTP error";
  const location = url ? ` at ${url}` : "";
  const body = responseBody ? ` — ${truncate(responseBody, 240)}` : "";

  return `LLM request failed: ${statusLabel}${location}${body}`;
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}
