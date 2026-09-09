import { extractAntigravityToolCall } from "@browserbasehq/stagehand-integrations-antigravity-sdk";
import type { ProbeEvidence, TaskSpec, Trajectory } from "stagehand-v3";
import type { StepObservation } from "../observationRecorder.js";
import {
  buildTrajectory,
  type NormalizedToolCall,
  type TrajectoryAdapter,
} from "./trajectoryAdapter.js";

export interface AntigravityRunResult {
  events: Array<Record<string, unknown>>;
  finalAnswer?: string;
  status?: Trajectory["status"];
  usage?: Partial<Trajectory["usage"]>;
  finalObservation?: ProbeEvidence;
  stepObservations?: StepObservation[];
  observedToolName?: (name: string) => boolean;
}

export class AntigravityTrajectoryAdapter implements TrajectoryAdapter<AntigravityRunResult> {
  fromHarnessResult(result: AntigravityRunResult, taskSpec: TaskSpec): Trajectory {
    const toolCalls: NormalizedToolCall[] = [];
    const openCalls = new Map<string, NormalizedToolCall>();
    const trailingTextParts: string[] = [];
    let pendingReasoning = "";

    for (const event of result.events) {
      const step = isRecord(event.step_update) ? event.step_update : undefined;
      if (
        event.event === "step_update" &&
        step?.step_type === "agent_response" &&
        typeof step.text_delta === "string"
      ) {
        pendingReasoning += step.text_delta;
        trailingTextParts.push(step.text_delta);
        continue;
      }

      const view = extractAntigravityToolCall(event);
      if (!view) continue;
      if (view.subtype === "started") {
        if (openCalls.has(view.callId)) continue;
        const call = normalizeToolCall(view, pendingReasoning);
        toolCalls.push(call);
        openCalls.set(view.callId, call);
        pendingReasoning = "";
        trailingTextParts.length = 0;
        continue;
      }

      const open = openCalls.get(view.callId);
      if (open) {
        applyCompletedToolCall(open, view);
        openCalls.delete(view.callId);
      } else {
        toolCalls.push(normalizeToolCall(view, pendingReasoning));
        pendingReasoning = "";
        trailingTextParts.length = 0;
      }
    }

    for (const open of openCalls.values()) {
      open.ok = false;
      open.result = "no tool result";
      open.error = "no tool result";
    }

    attachStepObservations(toolCalls, result);
    const trailing = trailingTextParts.join("").trim();
    const finalAnswer = result.finalAnswer ?? (trailing || undefined);
    const finalObservation = resolveFinalObservation(result.finalObservation, toolCalls);
    return buildTrajectory({
      taskSpec,
      toolCalls,
      finalAnswer,
      status: result.status ?? "complete",
      usage: result.usage,
      ...(finalObservation && { finalObservation }),
    });
  }
}

export const antigravityAdapter = new AntigravityTrajectoryAdapter();

type AntigravityToolView = NonNullable<ReturnType<typeof extractAntigravityToolCall>>;

function normalizeToolCall(view: AntigravityToolView, reasoning: string): NormalizedToolCall {
  const content = normalizeToolResult(view.result);
  return {
    name: view.name,
    args: view.args,
    result: content.result,
    ok: view.ok,
    ...(view.error && { error: view.error }),
    reasoning: reasoning.trim() || undefined,
    ...(content.images.length && { images: content.images }),
  };
}

function applyCompletedToolCall(call: NormalizedToolCall, view: AntigravityToolView): void {
  const content = normalizeToolResult(view.result);
  call.name = view.name;
  call.args = view.args;
  call.result = content.result;
  call.ok = view.ok;
  if (view.error) call.error = view.error;
  else delete call.error;
  if (content.images.length) call.images = content.images;
}

function normalizeToolResult(result: unknown): {
  result: unknown;
  images: Array<{ bytes: Buffer; mediaType: string }>;
} {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    return { result, images: [] };
  }
  const parts: string[] = [];
  const images: Array<{ bytes: Buffer; mediaType: string }> = [];
  for (const block of result.content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
      continue;
    }
    if (block.type === "image") {
      const source = isRecord(block.source) ? block.source : undefined;
      const data =
        source?.type === "base64" && typeof source.data === "string"
          ? source.data
          : typeof block.data === "string"
            ? block.data
            : undefined;
      if (!data) continue;
      const mediaType =
        typeof source?.media_type === "string"
          ? source.media_type
          : typeof block.mimeType === "string"
            ? block.mimeType
            : "image/png";
      images.push({ bytes: Buffer.from(data, "base64"), mediaType });
      parts.push("[image]");
    }
  }
  return { result: parts.join("\n"), images };
}

function attachStepObservations(
  toolCalls: NormalizedToolCall[],
  result: AntigravityRunResult,
): void {
  const observations = result.stepObservations ?? [];
  if (observations.length === 0) return;
  const isObservedTool =
    result.observedToolName ?? ((name: string) => name.startsWith("mcp") || name.includes("."));
  const observedCalls = toolCalls.filter((call) => isObservedTool(call.name));
  const totalObservedRuns =
    Math.max(...observations.map((observation) => observation.runIndex)) + 1;
  if (totalObservedRuns > observedCalls.length) return;
  const byRunIndex = new Map(
    observations.map((observation) => [observation.runIndex, observation.evidence]),
  );
  observedCalls.forEach((call, ordinal) => {
    const observation = byRunIndex.get(ordinal);
    if (observation) call.probeEvidence = observation;
  });
}

function resolveFinalObservation(
  finalObservation: ProbeEvidence | undefined,
  toolCalls: NormalizedToolCall[],
): ProbeEvidence | undefined {
  if (finalObservation?.screenshot) return finalObservation;
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const image = toolCalls[index].images?.at(-1);
    if (image) return { screenshot: image.bytes };
  }
  return finalObservation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
