import { spawn } from "node:child_process";
import {
  HarnessAdapterError,
  sanitizeErrorMessage,
  type HarnessLogger,
} from "@browserbasehq/stagehand-integrations/harness";

export type AntigravityEvent = Record<string, unknown>;

export type AntigravityProcessExit = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

export type AntigravityProcessRunner = (input: {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  signal: AbortSignal;
  onStdoutLine: (line: string) => void | Promise<void>;
  onStderr: (chunk: string) => void;
}) => Promise<AntigravityProcessExit>;

export type AntigravitySessionConfig = {
  cwd?: string;
  env?: Record<string, string>;
  binaryPath?: string;
  agent?: string;
  sandbox?: boolean;
  disableSlashCommands?: boolean;
  dangerouslySkipPermissions?: boolean;
  printTimeout?: string;
  extraArgs?: string[];
};

export type AntigravityTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  reported: boolean;
};

export type AntigravitySessionResult = {
  events: AntigravityEvent[];
  resultEvent?: AntigravityEvent;
  resultText: string;
  status: "completed" | "sdk_error";
  stopReason?: string;
  tokenUsage: AntigravityTokenUsage;
  exit?: AntigravityProcessExit;
  stderr: string;
  malformedLines: number;
  initTools?: string[];
  iterationError?: unknown;
};

export type AntigravityToolCallView = {
  callId: string;
  subtype: "started" | "completed";
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  ok: boolean;
  error?: string;
};

export const ANTIGRAVITY_BINARY = "agy";
const STDERR_LIMIT = 64 * 1024;

export function resolveAntigravityBinary(override?: string): string {
  return override ?? process.env.ANTIGRAVITY_CLI_PATH ?? ANTIGRAVITY_BINARY;
}

export function normalizeAntigravityModel(model: string): string | undefined {
  if (model === "antigravity/auto" || model === "auto") return undefined;
  return model.startsWith("antigravity/") ? model.slice("antigravity/".length) : model;
}

export function buildAntigravityArgs(input: {
  prompt: string;
  model?: string;
  session: AntigravitySessionConfig;
}): string[] {
  const { session } = input;
  return [
    "-p",
    input.prompt,
    "--output-format",
    "stream-json",
    ...(session.disableSlashCommands !== false ? ["--disable-slash-commands"] : []),
    ...(session.dangerouslySkipPermissions !== false ? ["--dangerously-skip-permissions"] : []),
    ...(session.sandbox !== false ? ["--sandbox"] : []),
    ...(session.agent ? ["--agent", session.agent] : []),
    ...(session.printTimeout ? ["--print-timeout", session.printTimeout] : []),
    ...(input.model ? ["--model", input.model] : []),
    ...(session.extraArgs ?? []),
  ];
}

export function parseAntigravityStreamLine(line: string): AntigravityEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function extractAntigravityInitTools(event: AntigravityEvent): string[] | undefined {
  if (event.event !== "init" || !isRecord(event.init) || !Array.isArray(event.init.tools)) {
    return undefined;
  }
  return event.init.tools.filter(
    (tool): tool is string => typeof tool === "string" && tool.length > 0,
  );
}

export function collectAntigravityInitTools(events: AntigravityEvent[]): string[] | undefined {
  for (const event of events) {
    const tools = extractAntigravityInitTools(event);
    if (tools) return tools;
  }
  return undefined;
}

export function collectAntigravityExecutedToolNames(events: AntigravityEvent[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const view = extractAntigravityToolCall(event);
    if (!view || seen.has(view.name)) continue;
    seen.add(view.name);
    names.push(view.name);
  }
  return names;
}

export function extractAntigravityToolCall(
  event: AntigravityEvent,
): AntigravityToolCallView | undefined {
  if (event.event !== "step_update" || !isRecord(event.step_update)) return undefined;
  const step = event.step_update;
  if (step.step_type !== "tool") return undefined;
  const state = readString(step.state);
  if (state !== "ACTIVE" && state !== "DONE") return undefined;
  const info = isRecord(step.tool_info) ? step.tool_info : {};
  const name = readString(step.tool_name) ?? readString(info.name) ?? "tool";
  const args = isRecord(info.parameters) ? info.parameters : {};
  const rawError = info.error;
  const error = rawError === undefined ? undefined : stringifyError(rawError);
  const ok = state === "ACTIVE" || !error;
  const stepIndex =
    typeof step.step_index === "number" || typeof step.step_index === "string"
      ? String(step.step_index)
      : "unknown";
  const callId = `${readString(step.conversation_id) ?? "conversation"}:${stepIndex}`;
  return {
    callId,
    subtype: state === "ACTIVE" ? "started" : "completed",
    name,
    args,
    ...(info.output !== undefined && { result: info.output }),
    ok,
    ...(error && { error }),
  };
}

export const defaultAntigravityProcessRunner: AntigravityProcessRunner = async (input) => {
  return new Promise<AntigravityProcessExit>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      ...(input.cwd && { cwd: input.cwd }),
      ...(input.env && { env: input.env }),
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutBuffer = "";
    let lineQueue = Promise.resolve();
    let killTimer: NodeJS.Timeout | undefined;
    let settled = false;

    const queueLine = (line: string): void => {
      lineQueue = lineQueue.then(() => input.onStdoutLine(line));
    };
    const removeAbort = (): void => input.signal.removeEventListener("abort", abort);
    const signalTree = (signal: NodeJS.Signals): void => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        // The process may have exited between the status check and signal.
      }
    };
    const abort = (): void => {
      signalTree("SIGTERM");
      killTimer = setTimeout(() => signalTree("SIGKILL"), 5_000);
      killTimer.unref();
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/u);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) queueLine(line);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => input.onStderr(chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      removeAbort();
      if (killTimer) clearTimeout(killTimer);
      if (error.code === "ENOENT") {
        reject(
          new HarnessAdapterError(
            "Antigravity harness requires the `agy` CLI. Install it from https://antigravity.google/docs/cli/getting-started/ or set ANTIGRAVITY_CLI_PATH.",
            { cause: error },
          ),
        );
        return;
      }
      reject(error);
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      removeAbort();
      if (killTimer) clearTimeout(killTimer);
      if (stdoutBuffer) queueLine(stdoutBuffer);
      lineQueue.then(
        () => resolve({ exitCode, signal }),
        (error) => reject(error),
      );
    });

    if (input.signal.aborted) abort();
    else input.signal.addEventListener("abort", abort, { once: true });
  });
};

export async function runAntigravitySession(input: {
  prompt: string;
  model: string;
  signal?: AbortSignal;
  logger: HarnessLogger;
  session: AntigravitySessionConfig;
  runProcess?: AntigravityProcessRunner;
  onToolResult?: (toolName: string, view: AntigravityToolCallView) => void | Promise<void>;
}): Promise<AntigravitySessionResult> {
  const events: AntigravityEvent[] = [];
  const controller = new AbortController();
  const forwardAbort = (): void => controller.abort(input.signal?.reason);
  if (input.signal) {
    if (input.signal.aborted) controller.abort(input.signal.reason);
    else input.signal.addEventListener("abort", forwardAbort, { once: true });
  }

  const textParts: string[] = [];
  let resultEvent: AntigravityEvent | undefined;
  let stderr = "";
  let exit: AntigravityProcessExit | undefined;
  let iterationError: unknown;
  let malformedLines = 0;

  try {
    const model = normalizeAntigravityModel(input.model);
    exit = await (input.runProcess ?? defaultAntigravityProcessRunner)({
      command: resolveAntigravityBinary(input.session.binaryPath),
      args: buildAntigravityArgs({ prompt: input.prompt, model, session: input.session }),
      ...(input.session.cwd && { cwd: input.session.cwd }),
      env: stringEnv({ ...process.env, ...input.session.env }),
      signal: controller.signal,
      onStdoutLine: async (line) => {
        if (!line.trim()) return;
        const parsed = parseAntigravityStreamLine(line);
        if (!parsed) {
          malformedLines += 1;
          return;
        }
        const event = deepSanitize(parsed) as AntigravityEvent;
        events.push(event);
        logAntigravityEvent(input.logger, event);
        if (event.event === "result" && isRecord(event.result)) resultEvent = event.result;
        if (
          event.event === "step_update" &&
          isRecord(event.step_update) &&
          event.step_update.step_type === "agent_response" &&
          typeof event.step_update.text_delta === "string"
        ) {
          textParts.push(event.step_update.text_delta);
        }
        const view = extractAntigravityToolCall(event);
        if (view?.subtype === "completed") await input.onToolResult?.(view.name, view);
      },
      onStderr: (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-STDERR_LIMIT);
      },
    });
  } catch (error) {
    iterationError = new HarnessAdapterError(
      sanitizeErrorMessage(stringifyError(error)) || "Antigravity session failed.",
    );
    input.logger.warn({
      category: "antigravity",
      message: `Antigravity stopped before a normal result: ${sanitizeErrorMessage(stringifyError(error))}`,
      level: 0,
    });
  } finally {
    input.signal?.removeEventListener("abort", forwardAbort);
  }

  stderr = sanitizeErrorMessage(stderr);
  if (stderr) input.logger.log({ category: "antigravity", message: stderr, level: 1 });
  const externalAbortReason = input.signal?.aborted
    ? stringifyError(input.signal.reason) || "Antigravity session aborted"
    : undefined;
  const stopReason = buildAntigravityStopReason({
    resultEvent,
    iterationError,
    exit,
    stderr,
    malformedLines,
    externalAbortReason,
  });
  const tokenUsage = readAntigravityUsage(resultEvent);
  const terminalText = readString(resultEvent?.response);
  const initTools = collectAntigravityInitTools(events);
  return {
    events,
    ...(resultEvent && { resultEvent }),
    resultText: terminalText ?? textParts.join(""),
    status: resolveAntigravityStatus(resultEvent, iterationError, exit, malformedLines),
    ...(stopReason && { stopReason: sanitizeErrorMessage(stopReason) }),
    tokenUsage,
    ...(exit && { exit }),
    stderr,
    malformedLines,
    ...(initTools && { initTools }),
    ...(iterationError !== undefined && { iterationError }),
  };
}

export function readAntigravityUsage(result: AntigravityEvent | undefined): AntigravityTokenUsage {
  const usage = isRecord(result?.usage) ? result.usage : undefined;
  const inputTokens = finiteNumber(usage?.input_tokens) ?? 0;
  const outputTokens = finiteNumber(usage?.output_tokens) ?? 0;
  const thinkingTokens = finiteNumber(usage?.thinking_tokens) ?? 0;
  const cachedInputTokens = finiteNumber(usage?.cache_read_tokens) ?? 0;
  const totalTokens =
    finiteNumber(usage?.total_tokens) ?? inputTokens + outputTokens + thinkingTokens;
  return {
    inputTokens,
    outputTokens,
    thinkingTokens,
    cachedInputTokens,
    totalTokens,
    reported: usage !== undefined,
  };
}

export function resolveAntigravityStatus(
  result: AntigravityEvent | undefined,
  iterationError?: unknown,
  exit?: AntigravityProcessExit,
  malformedLines = 0,
): "completed" | "sdk_error" {
  if (
    !iterationError &&
    malformedLines === 0 &&
    exit?.exitCode === 0 &&
    result?.status === "SUCCESS"
  ) {
    return "completed";
  }
  return "sdk_error";
}

export function buildAntigravityStopReason(input: {
  resultEvent?: AntigravityEvent;
  iterationError?: unknown;
  exit?: AntigravityProcessExit;
  stderr: string;
  malformedLines?: number;
  externalAbortReason?: string;
}): string | undefined {
  if (input.externalAbortReason) return input.externalAbortReason;
  if (input.iterationError) return stringifyError(input.iterationError);
  if (input.malformedLines) {
    return `Antigravity emitted ${input.malformedLines} malformed stdout line${input.malformedLines === 1 ? "" : "s"}`;
  }
  const terminalStatus = readString(input.resultEvent?.status);
  if (input.exit?.exitCode !== 0) {
    return `agy exited with code ${String(input.exit?.exitCode ?? "unknown")}${lastLine(input.stderr) ? `: ${lastLine(input.stderr)}` : ""}`;
  }
  if (!input.resultEvent) return "Antigravity exited without a terminal result event";
  if (terminalStatus !== "SUCCESS") {
    return (
      readString(input.resultEvent.error) ??
      `Antigravity finished with status ${terminalStatus ?? "unknown"}`
    );
  }
  return undefined;
}

export function buildAntigravityTranscript(events: AntigravityEvent[]): string {
  return events
    .map((event) => summarizeAntigravityEvent(event).detail)
    .filter((detail): detail is string => Boolean(detail))
    .join("\n");
}

export function logAntigravityEvent(logger: HarnessLogger, event: AntigravityEvent): void {
  const summary = summarizeAntigravityEvent(event);
  logger.log({
    category: "antigravity",
    message: summary.message,
    level: 1,
    auxiliary: {
      type: { value: readString(event.event) ?? "unknown", type: "string" },
      ...(summary.detail && { detail: { value: summary.detail, type: "string" } }),
    },
  });
}

export function summarizeAntigravityEvent(event: AntigravityEvent): {
  message: string;
  detail?: string;
} {
  const type = readString(event.event) ?? "unknown";
  const tool = extractAntigravityToolCall(event);
  if (tool) {
    return {
      message: `tool: ${tool.name} ${tool.subtype}${tool.ok ? "" : " failed"}`,
      detail: sanitizeOptional(safeJson(event)),
    };
  }
  if (type === "step_update" && isRecord(event.step_update)) {
    const stepType = readString(event.step_update.step_type) ?? "unknown";
    const text = readString(event.step_update.text_delta);
    return {
      message: `step: ${stepType} ${readString(event.step_update.state) ?? "unknown"}`,
      ...(text && { detail: sanitizeErrorMessage(text) }),
    };
  }
  if (type === "result" && isRecord(event.result)) {
    return {
      message: `result: ${readString(event.result.status) ?? "unknown"}`,
      detail: sanitizeOptional(safeJson(event)),
    };
  }
  return { message: `${type} event`, detail: sanitizeOptional(safeJson(event)) };
}

function lastLine(value: string): string | undefined {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

function deepSanitize(value: unknown): unknown {
  if (typeof value === "string") return sanitizeErrorMessage(value);
  if (Array.isArray(value)) return value.map(deepSanitize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, deepSanitize(child)]),
  );
}

function sanitizeOptional(value: string | undefined): string | undefined {
  return value === undefined ? undefined : sanitizeErrorMessage(value);
}

function stringEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function safeJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export function stringifyError(value: unknown): string {
  if (!value) return "";
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.message === "string") return value.message;
  return safeJson(value) ?? "Unknown error";
}
