import { afterEach, describe, expect, it } from "vitest";
import type { AvailableModel } from "stagehand-v3";
import type { AntigravityProcessRunner } from "@browserbasehq/stagehand-integrations-antigravity-sdk";
import {
  antigravityToolPolicyError,
  buildAntigravityPrompt,
  parseAntigravityResult,
  readAntigravityPrintTimeout,
  runAntigravityAgent,
} from "../../framework/antigravityRunner.js";
import type { ExternalHarnessTaskPlan } from "../../framework/externalHarnessPlan.js";
import { EvalLogger } from "../../logger.js";

const plan: ExternalHarnessTaskPlan = {
  dataset: "webvoyager",
  taskId: "wv-1",
  startUrl: "https://example.com",
  instruction: "Report the heading",
};
const originalTimeout = process.env.EVAL_ANTIGRAVITY_PRINT_TIMEOUT;

afterEach(() => {
  if (originalTimeout === undefined) delete process.env.EVAL_ANTIGRAVITY_PRINT_TIMEOUT;
  else process.env.EVAL_ANTIGRAVITY_PRINT_TIMEOUT = originalTimeout;
});

describe("antigravity runner", () => {
  it("builds a constrained browser prompt", () => {
    const prompt = buildAntigravityPrompt(plan, "Use stagehand__run.");
    expect(prompt).toContain("Dataset: webvoyager");
    expect(prompt).toContain("Task ID: wv-1");
    expect(prompt).toContain("Use stagehand__run.");
    expect(prompt).toContain("Your only browser access is the MCP server");
    expect(prompt).toContain("Do not edit workspace files.");
    expect(prompt).toContain("EVAL_RESULT:");
  });

  it("parses marked eval results", () => {
    expect(
      parseAntigravityResult(
        'text\nEVAL_RESULT: {"success":true,"summary":"done","finalAnswer":"ok"}',
      ),
    ).toMatchObject({ success: true, summary: "done", finalAnswer: "ok" });
  });

  it("runs the CLI stream and reports metrics", async () => {
    const result = await runAntigravityAgent({
      plan,
      model: "antigravity/auto" as AvailableModel,
      logger: new EvalLogger(false),
      runProcess: scriptedRunner([
        tool("DONE", 1),
        tool("DONE", 2),
        {
          event: "result",
          result: {
            status: "SUCCESS",
            response: 'EVAL_RESULT: {"success":true,"summary":"done","finalAnswer":"ok"}',
            duration_seconds: 3.5,
            num_turns: 1,
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              thinking_tokens: 2,
              cache_read_tokens: 4,
              total_tokens: 17,
            },
          },
        },
      ]),
    });
    const metrics = result.metrics as Record<string, { value: number; count: number }>;
    expect(result._success).toBe(true);
    expect(result.harnessStatus).toBe("completed");
    expect(result.antigravityStatus).toBe("completed");
    expect(result.finalAnswer).toBe("ok");
    expect(metrics.antigravity_tool_steps.value).toBe(2);
    expect(metrics.antigravity_duration_seconds.value).toBe(3.5);
    expect(metrics.antigravity_input_tokens.value).toBe(10);
    expect(metrics.antigravity_thinking_tokens.value).toBe(2);
  });

  it("returns failure for a nonzero exit", async () => {
    const result = await runAntigravityAgent({
      plan,
      model: "antigravity/auto" as AvailableModel,
      logger: new EvalLogger(false),
      runProcess: scriptedRunner([], 1),
    });
    expect(result._success).toBe(false);
    expect(result.antigravityStatus).toBe("sdk_error");
    expect(String(result.error)).toContain("exited with code 1");
  });

  it("reads the print timeout override", () => {
    expect(readAntigravityPrintTimeout()).toBe("10m");
    process.env.EVAL_ANTIGRAVITY_PRINT_TIMEOUT = " 20m ";
    expect(readAntigravityPrintTimeout()).toBe("20m");
  });

  it("fails when Antigravity advertises or executes built-in tools", async () => {
    expect(
      antigravityToolPolicyError({
        events: [],
        initTools: ["search_web", "stagehand__run"],
      })?.message,
    ).toContain("advertised built-in tools (search_web)");
    expect(
      antigravityToolPolicyError({
        events: [tool("DONE", 1, "read_url_content")],
      })?.message,
    ).toContain("executed built-in tools (read_url_content)");
    expect(
      antigravityToolPolicyError(
        { events: [], initTools: ["ask_permission"] },
        { mcpServerNames: ["stagehand"] },
      )?.message,
    ).toContain("did not include the mounted MCP browser tools");

    const result = await runAntigravityAgent({
      plan,
      model: "antigravity/auto" as AvailableModel,
      logger: new EvalLogger(false),
      runProcess: scriptedRunner([
        {
          event: "init",
          init: { tools: ["search_web", "read_url_content", "grep_search"] },
        },
        tool("DONE", 1, "search_web"),
        {
          event: "result",
          result: {
            status: "SUCCESS",
            response: 'EVAL_RESULT: {"success":true,"summary":"done","finalAnswer":"ok"}',
          },
        },
      ]),
    });
    expect(result._success).toBe(false);
    expect(result.antigravityStatus).toBe("sdk_error");
    expect(String(result.error)).toContain("advertised built-in tools");
  });
});

function tool(
  state: "ACTIVE" | "DONE",
  index: number,
  name = "stagehand__run",
): Record<string, unknown> {
  return {
    event: "step_update",
    step_update: {
      conversation_id: "c1",
      step_index: index,
      state,
      step_type: "tool",
      tool_name: name,
      tool_info: { name, parameters: {}, output: "ok" },
    },
  };
}

function scriptedRunner(
  events: Array<Record<string, unknown>>,
  exitCode = 0,
): AntigravityProcessRunner {
  return async (input) => {
    for (const event of events) await input.onStdoutLine(JSON.stringify(event));
    return { exitCode, signal: null };
  };
}
