import { afterEach, describe, expect, it, vi } from "vitest";
import { HarnessAdapterError } from "@browserbasehq/stagehand-integrations/harness";
import {
  buildAntigravityArgs,
  buildAntigravityStopReason,
  collectAntigravityExecutedToolNames,
  extractAntigravityInitTools,
  extractAntigravityToolCall,
  normalizeAntigravityModel,
  parseAntigravityStreamLine,
  readAntigravityUsage,
  resolveAntigravityBinary,
  resolveAntigravityStatus,
  runAntigravitySession,
  type AntigravityProcessRunner,
} from "../src/index.js";

const logger = { log: () => {}, warn: () => {}, error: () => {} };
const originalPath = process.env.ANTIGRAVITY_CLI_PATH;

afterEach(() => {
  if (originalPath === undefined) delete process.env.ANTIGRAVITY_CLI_PATH;
  else process.env.ANTIGRAVITY_CLI_PATH = originalPath;
});

describe("Antigravity CLI session", () => {
  it("builds headless arguments and normalizes models", () => {
    const args = buildAntigravityArgs({
      prompt: "do it",
      model: "gemini-3.8-flash-high",
      session: { agent: "stagehand", printTimeout: "12m", extraArgs: ["--effort", "high"] },
    });
    expect(args).toEqual([
      "-p",
      "do it",
      "--output-format",
      "stream-json",
      "--disable-slash-commands",
      "--dangerously-skip-permissions",
      "--sandbox",
      "--agent",
      "stagehand",
      "--print-timeout",
      "12m",
      "--model",
      "gemini-3.8-flash-high",
      "--effort",
      "high",
    ]);
    const restricted = buildAntigravityArgs({
      prompt: "task",
      session: {
        sandbox: false,
        disableSlashCommands: false,
        dangerouslySkipPermissions: false,
      },
    });
    expect(restricted).not.toContain("--sandbox");
    expect(restricted).not.toContain("--disable-slash-commands");
    expect(restricted).not.toContain("--dangerously-skip-permissions");
    expect(normalizeAntigravityModel("antigravity/auto")).toBeUndefined();
    expect(normalizeAntigravityModel("auto")).toBeUndefined();
    expect(normalizeAntigravityModel("antigravity/gemini-3.8-flash-high")).toBe(
      "gemini-3.8-flash-high",
    );
  });

  it("parses tool steps and completed callbacks", async () => {
    const completed = vi.fn();
    const events = [
      { event: "init", conversation_id: "c1", init: { tools: ["stagehand__run"] } },
      toolEvent("ACTIVE", 2, { name: "stagehand__run", parameters: { code: "return 1" } }),
      toolEvent("DONE", 2, {
        name: "stagehand__run",
        parameters: { code: "return 1" },
        output: { content: [{ type: "text", text: "1" }] },
      }),
      responseEvent("done"),
      resultEvent("SUCCESS", "done", {
        input_tokens: 10,
        output_tokens: 4,
        thinking_tokens: 2,
        cache_read_tokens: 3,
        total_tokens: 16,
      }),
    ];
    const result = await runAntigravitySession({
      prompt: "task",
      model: "antigravity/auto",
      logger,
      session: {},
      runProcess: scriptedRunner(events),
      onToolResult: completed,
    });

    expect(result.status).toBe("completed");
    expect(result.resultText).toBe("done");
    expect(result.tokenUsage).toEqual({
      inputTokens: 10,
      outputTokens: 4,
      thinkingTokens: 2,
      cachedInputTokens: 3,
      totalTokens: 16,
      reported: true,
    });
    expect(completed).toHaveBeenCalledOnce();
    expect(completed.mock.calls[0][0]).toBe("stagehand__run");
    expect(result.initTools).toEqual(["stagehand__run"]);
    expect(extractAntigravityInitTools(events[0])).toEqual(["stagehand__run"]);
    expect(collectAntigravityExecutedToolNames(events)).toEqual(["stagehand__run"]);
    expect(extractAntigravityToolCall(events[1])).toMatchObject({
      callId: "c1:2",
      subtype: "started",
      name: "stagehand__run",
      args: { code: "return 1" },
    });
  });

  it("parses JSON and rejects blank, scalar, and malformed lines", () => {
    expect(parseAntigravityStreamLine('{"event":"init"}')).toEqual({ event: "init" });
    expect(parseAntigravityStreamLine("  ")).toBeUndefined();
    expect(parseAntigravityStreamLine("not json")).toBeUndefined();
    expect(parseAntigravityStreamLine("[]")).toBeUndefined();
  });

  it.each(["ERROR", "CANCELED", "INTERRUPTED", "INVALID", "WAITING", "RUNNING"])(
    "maps %s to an SDK error",
    async (status) => {
      const result = await runAntigravitySession({
        prompt: "task",
        model: "auto",
        logger,
        session: {},
        runProcess: scriptedRunner([resultEvent(status, "", undefined, "stopped")]),
      });
      expect(result.status).toBe("sdk_error");
      expect(result.stopReason).toContain("stopped");
    },
  );

  it("fails closed for malformed output, missing results, and nonzero exits", async () => {
    const malformed = await runAntigravitySession({
      prompt: "task",
      model: "auto",
      logger,
      session: {},
      runProcess: async (input) => {
        await input.onStdoutLine("not json");
        await input.onStdoutLine(JSON.stringify(resultEvent("SUCCESS", "done")));
        return { exitCode: 0, signal: null };
      },
    });
    expect(malformed.status).toBe("sdk_error");
    expect(malformed.stopReason).toContain("1 malformed stdout line");

    const missing = await runAntigravitySession({
      prompt: "task",
      model: "auto",
      logger,
      session: {},
      runProcess: scriptedRunner([responseEvent("partial")]),
    });
    expect(missing.stopReason).toBe("Antigravity exited without a terminal result event");

    const exited = await runAntigravitySession({
      prompt: "task",
      model: "auto",
      logger,
      session: {},
      runProcess: scriptedRunner([], 2, "failed with bb_live_abcdefghi"),
    });
    expect(exited.stopReason).toContain("agy exited with code 2");
    expect(exited.stopReason).toContain("bb_live_abcd[redacted]");
  });

  it("sanitizes stored events and process errors", async () => {
    const secret = "sk-abcdef1234567890";
    const eventResultValue = await runAntigravitySession({
      prompt: "task",
      model: "auto",
      logger,
      session: {},
      runProcess: scriptedRunner([
        toolEvent("DONE", 1, { name: "stagehand__run", error: { message: secret } }),
        resultEvent("ERROR", "", undefined, secret),
      ]),
    });
    expect(JSON.stringify(eventResultValue.events)).toContain("sk-abcdef[redacted]");
    expect(JSON.stringify(eventResultValue.events)).not.toContain(secret);

    const processResult = await runAntigravitySession({
      prompt: "task",
      model: "auto",
      logger,
      session: {},
      runProcess: async () => {
        throw new Error(`process failed with ${secret}`);
      },
    });
    expect(processResult.iterationError).toBeInstanceOf(HarnessAdapterError);
    expect(String(processResult.iterationError)).toContain("sk-abcdef[redacted]");
  });

  it("forwards cancellation and reports the abort reason", async () => {
    const controller = new AbortController();
    const runProcess: AntigravityProcessRunner = async (input) => {
      await new Promise<void>((resolve) => {
        input.signal.addEventListener("abort", () => resolve(), { once: true });
        controller.abort("test cancellation");
      });
      return { exitCode: null, signal: "SIGTERM" };
    };

    const result = await runAntigravitySession({
      prompt: "task",
      model: "auto",
      logger,
      signal: controller.signal,
      session: {},
      runProcess,
    });

    expect(result.status).toBe("sdk_error");
    expect(result.stopReason).toBe("test cancellation");
    expect(result.exit).toEqual({ exitCode: null, signal: "SIGTERM" });
  });

  it("bounds and sanitizes captured stderr", async () => {
    const secret = "sk-abcdef1234567890";
    const result = await runAntigravitySession({
      prompt: "task",
      model: "auto",
      logger,
      session: {},
      runProcess: scriptedRunner([], 1, `${"x".repeat(70 * 1024)}\n${secret}`),
    });

    expect(Buffer.byteLength(result.stderr, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(result.stderr).toContain("sk-abcdef[redacted]");
    expect(result.stderr).not.toContain(secret);
  });

  it("resolves usage fallbacks, status, stop reasons, and binary overrides", () => {
    expect(readAntigravityUsage({ usage: { input_tokens: 2, output_tokens: 3 } })).toMatchObject({
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
      reported: true,
    });
    expect(
      resolveAntigravityStatus({ status: "SUCCESS" }, undefined, { exitCode: 0, signal: null }),
    ).toBe("completed");
    expect(
      buildAntigravityStopReason({
        resultEvent: { status: "ERROR", error: "bad" },
        exit: { exitCode: 0, signal: null },
        stderr: "",
      }),
    ).toBe("bad");
    process.env.ANTIGRAVITY_CLI_PATH = "/env/agy";
    expect(resolveAntigravityBinary()).toBe("/env/agy");
    expect(resolveAntigravityBinary("/explicit/agy")).toBe("/explicit/agy");
  });
});

function toolEvent(
  state: "ACTIVE" | "DONE",
  stepIndex: number,
  toolInfo: Record<string, unknown>,
): Record<string, unknown> {
  return {
    event: "step_update",
    step_update: {
      conversation_id: "c1",
      step_index: stepIndex,
      state,
      step_type: "tool",
      tool_name: toolInfo.name,
      tool_info: toolInfo,
    },
  };
}

function responseEvent(text: string): Record<string, unknown> {
  return {
    event: "step_update",
    step_update: { state: "DONE", step_type: "agent_response", text_delta: text },
  };
}

function resultEvent(
  status: string,
  response: string,
  usage?: Record<string, unknown>,
  error?: string,
): Record<string, unknown> {
  return {
    event: "result",
    result: {
      conversation_id: "c1",
      status,
      response,
      duration_seconds: 1.25,
      num_turns: 1,
      ...(usage && { usage }),
      ...(error && { error }),
    },
  };
}

function scriptedRunner(
  events: Array<Record<string, unknown>>,
  exitCode = 0,
  stderr = "",
): AntigravityProcessRunner {
  return async (input) => {
    for (const event of events) await input.onStdoutLine(JSON.stringify(event));
    if (stderr) input.onStderr(stderr);
    return { exitCode, signal: null };
  };
}
