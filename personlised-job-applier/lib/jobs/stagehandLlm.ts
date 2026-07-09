import { createOpenAI } from "@ai-sdk/openai";

const DEFAULT_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_GATEWAY_MODEL = "openai/gpt-5-nano";

type StagehandModule = typeof import("@browserbasehq/stagehand");

export function getGatewayBaseUrl() {
  return process.env.AI_GATEWAY_BASE_URL ?? DEFAULT_GATEWAY_BASE_URL;
}

export function getGatewayModelId() {
  return process.env.AI_GATEWAY_MODEL ?? DEFAULT_GATEWAY_MODEL;
}

async function loadStagehandPackage(): Promise<StagehandModule> {
  const packageName =
    process.env.STAGEHAND_PACKAGE_NAME ?? "@browserbasehq/stagehand";
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<StagehandModule>;
  return dynamicImport(packageName);
}

export async function createStagehandLlmClient() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required for Stagehand LLM calls.");
  }

  const { AISdkClient } = await loadStagehandPackage();
  const openai = createOpenAI({
    apiKey,
    baseURL: getGatewayBaseUrl(),
  });

  return new AISdkClient({
    model: openai(getGatewayModelId()),
  });
}
