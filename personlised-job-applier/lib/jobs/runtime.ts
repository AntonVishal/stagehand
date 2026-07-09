export const REQUIRED_RUN_ENV = [
  "BROWSERBASE_API_KEY",
  "BROWSERBASE_PROJECT_ID",
  "AI_GATEWAY_API_KEY",
] as const;

export function missingRunEnv() {
  return REQUIRED_RUN_ENV.filter((key) => !process.env[key]);
}

export function hasRunEnv() {
  return missingRunEnv().length === 0;
}

export function runtimeState() {
  const missingEnv = missingRunEnv();
  return {
    canRunApplications: missingEnv.length === 0,
    missingEnv,
  };
}
