import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ANTIGRAVITY_TOOL_SURFACES,
  buildAntigravityAgent,
  buildAntigravityExplicitMcpToolNames,
  buildAntigravityMcpConfig,
  findDisallowedAntigravityTools,
  isAntigravityBuiltinToolName,
  isAntigravityMountToolName,
  useExplicitAntigravityMcpTools,
  writeAntigravityWorkspace,
} from "../../framework/antigravityToolAdapter.js";
import { resolveToolSurface } from "../../framework/harnesses/toolSurfaceResolution.js";

const tempDirs: string[] = [];
const originalExplicit = process.env.EVAL_ANTIGRAVITY_EXPLICIT_MCP_TOOLS;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fsp.rm(dir, { recursive: true, force: true })));
  if (originalExplicit === undefined) delete process.env.EVAL_ANTIGRAVITY_EXPLICIT_MCP_TOOLS;
  else process.env.EVAL_ANTIGRAVITY_EXPLICIT_MCP_TOOLS = originalExplicit;
});

describe("antigravity tool adapter helpers", () => {
  it("declares all MCP tool surfaces", () => {
    const harness = { harness: "antigravity", supportedToolSurfaces: ANTIGRAVITY_TOOL_SURFACES };
    expect(ANTIGRAVITY_TOOL_SURFACES).toEqual([
      "stagehand_facade",
      "playwright_mcp",
      "chrome_devtools_mcp",
    ]);
    expect(resolveToolSurface(harness, undefined)).toBe("stagehand_facade");
    expect(resolveToolSurface(harness, "playwright_mcp")).toBe("playwright_mcp");
    expect(() => resolveToolSurface(harness, "browse_cli")).toThrow(/browse_cli/);
  });

  it("writes an MCP-only custom agent allowlist", async () => {
    const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "antigravity-workspace-test-"));
    tempDirs.push(cwd);
    const servers = { stagehand: { command: "node", args: ["server.mjs"] } };
    expect(buildAntigravityMcpConfig(servers)).toEqual({ mcpServers: servers });
    const result = await writeAntigravityWorkspace(cwd, servers);
    expect(result.mcpConfigPath).toBe(path.join(cwd, ".agents", "mcp_config.json"));
    expect(result.agentPath).toBe(path.join(cwd, ".agents", "agents", "stagehand", "agent.md"));
    expect(result.tools).toEqual([
      "stagehand__run",
      "stagehand__snapshot",
      "stagehand__screenshot",
    ]);
    expect(JSON.parse(await fsp.readFile(result.mcpConfigPath, "utf8"))).toEqual({
      mcpServers: servers,
    });
    const agent = await fsp.readFile(result.agentPath, "utf8");
    expect(agent).toBe(buildAntigravityAgent({ tools: result.tools }));
    expect(agent).toContain("inheritMcp: true");
    expect(agent).toContain("subagent: false");
    expect(agent).toContain("commandExecutionPolicy: off");
    expect(agent).toContain("  - stagehand__run");
    expect(agent).toContain("skills: []");
  });

  it("can list explicit MCP tool names when inheritMcp is not enough", async () => {
    expect(buildAntigravityExplicitMcpToolNames(["stagehand"])).toEqual([
      "stagehand__run",
      "stagehand__snapshot",
      "stagehand__screenshot",
    ]);
    expect(useExplicitAntigravityMcpTools({})).toBe(true);
    expect(useExplicitAntigravityMcpTools({ EVAL_ANTIGRAVITY_EXPLICIT_MCP_TOOLS: "0" })).toBe(false);
    const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "antigravity-explicit-tools-"));
    tempDirs.push(cwd);
    const result = await writeAntigravityWorkspace(
      cwd,
      { stagehand: { command: "node" } },
      { explicitMcpTools: true },
    );
    const empty = await writeAntigravityWorkspace(
      cwd,
      { stagehand: { command: "node" } },
      { explicitMcpTools: false },
    );
    expect(empty.tools).toEqual([]);
    expect(await fsp.readFile(empty.agentPath, "utf8")).toContain("tools: []");
  });

  it("flags built-in tools that are not mounted MCP tools", () => {
    expect(isAntigravityBuiltinToolName("search_web")).toBe(true);
    expect(isAntigravityBuiltinToolName("stagehand__run")).toBe(false);
    expect(
      findDisallowedAntigravityTools(
        ["search_web", "stagehand__run", "view_file"],
        (name) => name.startsWith("stagehand"),
      ),
    ).toEqual(["search_web", "view_file"]);
  });

  it("matches Antigravity MCP tool name variants", () => {
    const matches = (name: string) => isAntigravityMountToolName(["stagehand"], name);
    for (const name of [
      "stagehand.run",
      "stagehand__run",
      "mcp__stagehand__run",
      "stagehand",
      "stagehand:run",
      "call_mcp_tool",
    ]) {
      expect(matches(name)).toBe(true);
    }
    expect(matches("shell")).toBe(false);
    expect(matches("mcp__stagehand_extra__run")).toBe(false);
  });
});
