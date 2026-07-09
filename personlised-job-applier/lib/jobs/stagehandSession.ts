import { createStagehandLogger } from "@/lib/jobs/jobLogger";
import { createStagehandLlmClient } from "@/lib/jobs/stagehandLlm";

export type StagehandModule = typeof import("@browserbasehq/stagehand");
export type StagehandInstance = InstanceType<StagehandModule["Stagehand"]>;

export type BrowserbaseSession = {
  sessionId?: string;
  replayUrl?: string;
};

export async function createJobStagehand(jobId: string) {
  const { Stagehand } = await loadStagehand();
  return new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    verbose: 1,
    disableAPI: true,
    disablePino: true,
    logger: createStagehandLogger(jobId),
    llmClient: await createStagehandLlmClient(),
  });
}

export async function createApplicationStagehand(jobId: string) {
  const { Stagehand } = await loadStagehand();
  return new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    verbose: 1,
    disableAPI: true,
    disablePino: true,
    logInferenceToFile: true,
    cacheDir: ".job-agent/stagehand-cache",
    logger: createStagehandLogger(jobId),
    llmClient: await createStagehandLlmClient(),
  });
}

export function getBrowserbaseSession(stagehand: unknown): BrowserbaseSession {
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

async function loadStagehand(): Promise<StagehandModule> {
  const packageName =
    process.env.STAGEHAND_PACKAGE_NAME ?? "@browserbasehq/stagehand";
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<StagehandModule>;
  return dynamicImport(packageName);
}
