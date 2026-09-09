import { describe, expect, it } from "vitest";
import type { TaskSpec } from "stagehand-v3";
import { antigravityAdapter } from "../../framework/harnesses/antigravityAdapter.js";

const taskSpec: TaskSpec = { id: "antigravity-test", instruction: "do the task" };

describe("antigravity trajectory adapter", () => {
  it("pairs tool steps with reasoning and final text", () => {
    const trajectory = antigravityAdapter.fromHarnessResult(
      {
        events: [
          response("I will inspect the page."),
          tool("ACTIVE", 2, "stagehand__snapshot", { includeIframes: false }),
          tool("DONE", 2, "stagehand__snapshot", { includeIframes: false }, "tree"),
          response("finished"),
        ],
      },
      taskSpec,
    );
    expect(trajectory.steps).toHaveLength(1);
    expect(trajectory.steps[0]).toMatchObject({
      actionName: "stagehand__snapshot",
      reasoning: "I will inspect the page.",
      toolOutput: { ok: true, result: "tree" },
    });
    expect(trajectory.finalAnswer).toBe("finished");
  });

  it("keeps completed-only calls and marks unmatched active calls failed", () => {
    const trajectory = antigravityAdapter.fromHarnessResult(
      {
        events: [
          tool("DONE", 1, "stagehand__run", {}, "ok"),
          tool("ACTIVE", 2, "stagehand__snapshot", {}),
        ],
      },
      taskSpec,
    );
    expect(trajectory.steps).toHaveLength(2);
    expect(trajectory.steps[0].toolOutput).toMatchObject({ ok: true, result: "ok" });
    expect(trajectory.steps[1].toolOutput).toMatchObject({
      ok: false,
      error: "no tool result",
    });
  });

  it("decodes MCP images and attaches browser observations", () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const trajectory = antigravityAdapter.fromHarnessResult(
      {
        events: [
          tool(
            "DONE",
            1,
            "stagehand__screenshot",
            {},
            {
              content: [
                { type: "text", text: "captured" },
                { type: "image", data: bytes.toString("base64"), mimeType: "image/png" },
              ],
            },
          ),
        ],
        observedToolName: (name) => name.startsWith("stagehand__"),
        stepObservations: [{ runIndex: 0, evidence: { url: "https://example.com" } }],
      },
      taskSpec,
    );
    expect(trajectory.steps[0].probeEvidence.url).toBe("https://example.com");
    expect(trajectory.steps[0].agentEvidence.modalities.some((item) => item.type === "image")).toBe(
      true,
    );
    expect(trajectory.finalObservation?.screenshot?.equals(bytes)).toBe(true);
  });

  it("passes error status through", () => {
    expect(
      antigravityAdapter.fromHarnessResult({ events: [], status: "error" }, taskSpec).status,
    ).toBe("error");
  });
});

function response(text: string): Record<string, unknown> {
  return {
    event: "step_update",
    step_update: { state: "DONE", step_type: "agent_response", text_delta: text },
  };
}

function tool(
  state: "ACTIVE" | "DONE",
  index: number,
  name: string,
  parameters: Record<string, unknown>,
  output?: unknown,
): Record<string, unknown> {
  return {
    event: "step_update",
    step_update: {
      conversation_id: "c1",
      step_index: index,
      state,
      step_type: "tool",
      tool_name: name,
      tool_info: { name, parameters, ...(output !== undefined && { output }) },
    },
  };
}
