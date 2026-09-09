import {
  buildAntigravityTranscript,
  collectAntigravityExecutedToolNames,
  extractAntigravityToolCall,
  runAntigravitySession,
  stringifyError,
  type AntigravityProcessRunner,
  type AntigravityTokenUsage,
} from "@browserbasehq/stagehand-integrations-antigravity-sdk";
import { HarnessAdapterError } from "@browserbasehq/stagehand-integrations/harness";
import type { AvailableModel } from "stagehand-v3";
import type { EvalLogger } from "../logger.js";
import {
  describeAntigravityToolPolicyFailure,
  findDisallowedAntigravityTools,
  isAntigravityMountToolName,
  type PreparedAntigravityToolAdapter,
} from "./antigravityToolAdapter.js";
import type { ExternalHarnessTaskPlan } from "./externalHarnessPlan.js";
import { antigravityAdapter } from "./harnesses/antigravityAdapter.js";
import {
  buildExternalHarnessPrompt,
  metricValue,
  parseEvalResult,
  runExternalHarnessTask,
  type ExternalHarnessToolAdapterLike,
  type MetricValue,
  type ParsedEvalResult,
} from "./harnesses/externalRunner.js";
import type { TaskResult } from "./types.js";
import type { ExternalHarnessVerifierConfig } from "./verifierAdapter.js";

export type { AntigravityProcessRunner } from "@browserbasehq/stagehand-integrations-antigravity-sdk";

export interface AntigravityRunnerInput {
  plan: ExternalHarnessTaskPlan;
  model: AvailableModel;
  logger: EvalLogger;
  toolAdapter?: PreparedAntigravityToolAdapter;
  signal?: AbortSignal;
  runProcess?: AntigravityProcessRunner;
  verifier?: ExternalHarnessVerifierConfig;
}

export interface ParsedAntigravityResult extends ParsedEvalResult {}

const MCP_ONLY_LINE =
  "Your only browser access is the MCP server configured in this workspace. Never launch a browser yourself or run shell commands to browse.";

function composeAntigravityToolInstructions(toolInstructions?: string): string {
  return [
    toolInstructions ?? "Use the available browser tools to complete the task.",
    MCP_ONLY_LINE,
    "For Stagehand snapshots, start with includeIframes:false. Include iframes only when the task needs embedded-frame content.",
    "Check every requested constraint against the observed page data before selecting a result.",
    "Before the final answer, recheck that the selected result satisfies all constraints together.",
    "Do not edit workspace files.",
  ].join("\n");
}

export function buildAntigravityPrompt(
  plan: ExternalHarnessTaskPlan,
  toolInstructions?: string,
): string {
  return buildExternalHarnessPrompt({
    plan,
    toolInstructions: composeAntigravityToolInstructions(toolInstructions),
    resultContract: "marker",
  });
}

export function parseAntigravityResult(raw: string): ParsedAntigravityResult {
  return parseEvalResult(raw);
}

export async function runAntigravityAgent({
  plan,
  model,
  logger,
  toolAdapter,
  signal,
  runProcess,
  verifier,
}: AntigravityRunnerInput): Promise<TaskResult> {
  const adapterLike: ExternalHarnessToolAdapterLike = {
    promptInstructions: composeAntigravityToolInstructions(toolAdapter?.promptInstructions),
    captureEvidence: toolAdapter?.captureEvidence,
    drainStepObservations: toolAdapter?.drainStepObservations,
    observedToolMatcher: toolAdapter?.observedToolMatcher,
  };
  return runExternalHarnessTask({
    harness: "antigravity",
    plan,
    logger,
    toolAdapter: adapterLike,
    verifier,
    resultContract: "marker",
    fallbackErrorMessage: "Antigravity did not report success",
    parseResult: parseAntigravityResult,
    runSession: async (prompt) => {
      const sessionResult = await runAntigravitySession({
        prompt,
        model,
        logger,
        signal,
        runProcess,
        session: {
          ...(toolAdapter?.cwd && { cwd: toolAdapter.cwd }),
          ...(toolAdapter?.env && { env: toolAdapter.env }),
          ...(process.env.EVAL_ANTIGRAVITY_PATH && {
            binaryPath: process.env.EVAL_ANTIGRAVITY_PATH,
          }),
          agent: "stagehand",
          sandbox: true,
          disableSlashCommands: true,
          dangerouslySkipPermissions: true,
          printTimeout: readAntigravityPrintTimeout(),
        },
        onToolResult: toolAdapter?.onToolResult
          ? (name) => toolAdapter.onToolResult!(name)
          : undefined,
      });
      const usage = sessionResult.tokenUsage;
      const toolPolicyError = antigravityToolPolicyError(sessionResult, toolAdapter);
      const iterationError = toolPolicyError ?? sessionResult.iterationError;
      const status = toolPolicyError ? "sdk_error" : sessionResult.status;
      return {
        raw: sessionResult,
        resultText: sessionResult.resultText,
        transcriptText: buildAntigravityTranscript(sessionResult.events),
        iterationError,
        status,
        stopReason:
          sessionResult.stopReason ||
          (status === "sdk_error" ? stringifyError(iterationError) || undefined : undefined),
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          ...(usage.reported && {
            cachedInputTokens: usage.cachedInputTokens,
            reasoningOutputTokens: usage.thinkingTokens,
          }),
        },
        metrics: buildAntigravityMetrics(usage, sessionResult.resultEvent, sessionResult.events),
      };
    },
    toTrajectory: (
      { raw, parsed, finalObservation, stepObservations, observedToolName, status },
      taskSpec,
    ) =>
      antigravityAdapter.fromHarnessResult(
        {
          events: raw.events,
          ...(finalObservation && { finalObservation }),
          ...(stepObservations?.length && { stepObservations }),
          ...(observedToolName && { observedToolName }),
          finalAnswer: parsed.finalAnswer ?? raw.resultText,
          status,
          usage: {
            input_tokens: raw.tokenUsage.inputTokens,
            output_tokens: raw.tokenUsage.outputTokens,
            cached_input_tokens: raw.tokenUsage.cachedInputTokens,
            reasoning_tokens: raw.tokenUsage.thinkingTokens,
          },
        },
        taskSpec,
      ),
  });
}

export function readAntigravityPrintTimeout(): string {
  return process.env.EVAL_ANTIGRAVITY_PRINT_TIMEOUT?.trim() || "10m";
}

export function antigravityToolPolicyError(
  session: {
    events: Array<Record<string, unknown>>;
    initTools?: string[];
  },
  toolAdapter?: Pick<PreparedAntigravityToolAdapter, "mcpServerNames" | "observedToolMatcher">,
): HarnessAdapterError | undefined {
  const isMountTool =
    toolAdapter?.observedToolMatcher ??
    ((name: string) =>
      toolAdapter?.mcpServerNames
        ? isAntigravityMountToolName(toolAdapter.mcpServerNames, name)
        : false);
  const advertised = findDisallowedAntigravityTools(session.initTools ?? [], isMountTool);
  const executed = findDisallowedAntigravityTools(
    collectAntigravityExecutedToolNames(session.events),
    isMountTool,
  );
  const mcpMissing =
    session.initTools !== undefined &&
    Boolean(toolAdapter?.mcpServerNames?.length) &&
    !session.initTools.some((name) => isMountTool(name));
  const message = describeAntigravityToolPolicyFailure({
    advertised,
    executed,
    mcpMissing,
  });
  return message ? new HarnessAdapterError(message) : undefined;
}

export function buildAntigravityMetrics(
  usage: AntigravityTokenUsage,
  resultEvent: Record<string, unknown> | undefined,
  events: Array<Record<string, unknown>>,
): Record<string, MetricValue> {
  const toolSteps = events.filter(
    (event) => extractAntigravityToolCall(event)?.subtype === "completed",
  ).length;
  return {
    antigravity_input_tokens: metricValue(usage.inputTokens),
    antigravity_output_tokens: metricValue(usage.outputTokens),
    antigravity_total_tokens: metricValue(usage.totalTokens),
    antigravity_cached_input_tokens: metricValue(usage.cachedInputTokens),
    antigravity_thinking_tokens: metricValue(usage.thinkingTokens),
    antigravity_duration_seconds: metricValue(resultEvent?.duration_seconds),
    antigravity_num_turns: metricValue(resultEvent?.num_turns),
    antigravity_tool_steps: metricValue(toolSteps),
  };
}
