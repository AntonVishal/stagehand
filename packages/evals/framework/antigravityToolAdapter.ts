import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProbeEvidence } from "stagehand-v3";
import type { StartupProfile, ToolSurface } from "../core/contracts/tool.js";
import { EvalsError } from "../errors.js";
import type { EvalLogger } from "../logger.js";
import { startAgentToolRuntime } from "./agentToolRuntime.js";
import type { ExternalHarnessTaskPlan } from "./externalHarnessPlan.js";
import { resolveStartupProfile, resolveToolSurface } from "./harnesses/toolSurfaceResolution.js";
import { ObservationRecorder, type StepObservation } from "./observationRecorder.js";

export interface AntigravityToolAdapterInput {
  toolSurface?: ToolSurface;
  startupProfile?: StartupProfile;
  environment: "LOCAL" | "BROWSERBASE";
  plan: ExternalHarnessTaskPlan;
  logger: EvalLogger;
}

export interface PreparedAntigravityToolAdapter {
  toolSurface: ToolSurface;
  startupProfile: StartupProfile;
  cwd: string;
  env: Record<string, string>;
  mcpConfigPath: string;
  agentPath: string;
  mcpServerNames: string[];
  promptInstructions: string;
  captureEvidence?: () => Promise<ProbeEvidence>;
  drainStepObservations?: () => Promise<StepObservation[]>;
  onToolResult?: (toolName: string) => void;
  observedToolMatcher?: (name: string) => boolean;
  cleanup: () => Promise<void>;
}

export const ANTIGRAVITY_TOOL_SURFACES: ToolSurface[] = [
  "stagehand_facade",
  "playwright_mcp",
  "chrome_devtools_mcp",
];

export const ANTIGRAVITY_FACADE_TOOL_NAMES = ["run", "snapshot", "screenshot"] as const;

/** Built-in Antigravity tools that must not appear in a Stagehand browser eval. */
export const ANTIGRAVITY_BUILTIN_TOOL_NAMES = [
  "search_web",
  "read_url_content",
  "grep_search",
  "view_file",
  "run_command",
  "list_dir",
  "list_directory",
  "define_subagent",
  "manage_subagents",
  "invoke_subagent",
  "start_subagent",
  "create_file",
  "edit_file",
  "replace_file_content",
  "find_file",
  "search_directory",
  "ask_question",
  "generate_image",
  "write_to_file",
  "read_file",
  "write_file",
] as const;

const ANTIGRAVITY_BUILTIN_TOOL_NAME_SET = new Set<string>(ANTIGRAVITY_BUILTIN_TOOL_NAMES);

export function buildAntigravityMcpConfig(mcpServers: Record<string, unknown>): {
  mcpServers: Record<string, unknown>;
} {
  return { mcpServers };
}

export function buildAntigravityExplicitMcpToolNames(serverNames: string[]): string[] {
  return [
    ...new Set(
      serverNames.flatMap((server) =>
        ANTIGRAVITY_FACADE_TOOL_NAMES.map((tool) => `${server}__${tool}`),
      ),
    ),
  ];
}

export function useExplicitAntigravityMcpTools(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.EVAL_ANTIGRAVITY_EXPLICIT_MCP_TOOLS?.trim().toLowerCase();
  if (value === "0" || value === "false" || value === "no") return false;
  // Live WebVoyager showed `tools: []` still advertises search_web/view_file; default to
  // an explicit MCP allowlist so built-ins are actually removed from model context.
  return true;
}

export function isAntigravityBuiltinToolName(toolName: string): boolean {
  return ANTIGRAVITY_BUILTIN_TOOL_NAME_SET.has(toolName);
}

export function findDisallowedAntigravityTools(
  toolNames: string[],
  isMountTool: (name: string) => boolean = () => false,
): string[] {
  return [...new Set(toolNames.filter((name) => name.length > 0))].filter(
    (name) => isAntigravityBuiltinToolName(name) && !isMountTool(name),
  );
}

export function describeAntigravityToolPolicyFailure(input: {
  advertised?: string[];
  executed?: string[];
  mcpMissing?: boolean;
}): string | undefined {
  const advertised = input.advertised ?? [];
  const executed = input.executed ?? [];
  if (advertised.length) {
    return `Antigravity advertised built-in tools (${advertised.join(", ")}); the stagehand agent must be MCP-only.`;
  }
  if (executed.length) {
    return `Antigravity executed built-in tools (${executed.join(", ")}); the stagehand agent must be MCP-only.`;
  }
  if (input.mcpMissing) {
    return "Antigravity init.tools did not include the mounted MCP browser tools. Set EVAL_ANTIGRAVITY_EXPLICIT_MCP_TOOLS=1 to list server__run/snapshot/screenshot in the agent allowlist.";
  }
  return undefined;
}

export function buildAntigravityAgent(options: { tools?: string[] } = {}): string {
  const tools = options.tools ?? [];
  return `---
name: stagehand
description: Browser-only agent backed by the Stagehand MCP server.
mainAgent: true
subagent: false
inheritMcp: true
commandExecutionPolicy: off
tools: ${formatYamlStringList(tools)}
skills: []
---

Use only the MCP browser tools configured in this workspace. Never launch another browser,
use shell commands for browsing, or edit workspace files.

The Stagehand facade exposes run, snapshot, and screenshot. Open URLs through run, use
snapshot for the accessibility tree and element IDs, and use screenshot only when pixels matter.
`;
}

export async function writeAntigravityWorkspace(
  cwd: string,
  mcpServers: Record<string, unknown>,
  options: { explicitMcpTools?: boolean } = {},
): Promise<{ mcpConfigPath: string; agentPath: string; tools: string[] }> {
  const agentsDir = path.join(cwd, ".agents");
  const agentDir = path.join(agentsDir, "agents", "stagehand");
  const mcpConfigPath = path.join(agentsDir, "mcp_config.json");
  const agentPath = path.join(agentDir, "agent.md");
  const tools = (options.explicitMcpTools ?? useExplicitAntigravityMcpTools())
    ? buildAntigravityExplicitMcpToolNames(Object.keys(mcpServers))
    : [];
  await fsp.mkdir(agentDir, { recursive: true });
  await Promise.all([
    fsp.writeFile(
      mcpConfigPath,
      `${JSON.stringify(buildAntigravityMcpConfig(mcpServers), null, 2)}\n`,
      { mode: 0o600 },
    ),
    fsp.writeFile(agentPath, buildAntigravityAgent({ tools }), { mode: 0o600 }),
  ]);
  return { mcpConfigPath, agentPath, tools };
}

export function isAntigravityMountToolName(serverNames: string[], toolName: string): boolean {
  if (toolName === "call_mcp_tool") return true;
  return serverNames.some(
    (server) =>
      toolName === server ||
      toolName.startsWith(`${server}.`) ||
      toolName.startsWith(`${server}__`) ||
      toolName === `mcp__${server}` ||
      toolName.startsWith(`mcp__${server}__`) ||
      toolName.startsWith(`${server}:`),
  );
}

function formatYamlStringList(values: string[]): string {
  if (values.length === 0) return "[]";
  return `\n${values.map((value) => `  - ${yamlQuote(value)}`).join("\n")}`;
}

function yamlQuote(value: string): string {
  return /[:#[\]{}&*!|>'"%@`]/u.test(value) ? JSON.stringify(value) : value;
}

export async function prepareAntigravityToolAdapter(
  input: AntigravityToolAdapterInput,
): Promise<PreparedAntigravityToolAdapter> {
  const toolSurface = resolveToolSurface(
    { harness: "antigravity", supportedToolSurfaces: ANTIGRAVITY_TOOL_SURFACES },
    input.toolSurface,
  );
  if (toolSurface === undefined) {
    throw new EvalsError("antigravity harness requires a tool surface.");
  }
  const startupProfile = resolveStartupProfile(
    toolSurface,
    input.environment,
    input.startupProfile,
  );
  const runtime = await startAgentToolRuntime({
    toolSurface,
    startupProfile,
    environment: input.environment,
    logger: input.logger,
  });

  let cwd: string | undefined;
  try {
    const mount = runtime.running.agentMount;
    if (!mount) {
      throw new EvalsError(`Tool surface "${toolSurface}" does not provide an agent mount.`);
    }
    if (mount.via !== "mcp") {
      throw new EvalsError(
        `Antigravity does not support agent mounts delivered via "${mount.via}" yet.`,
      );
    }

    cwd = await fsp.mkdtemp(
      path.join(os.tmpdir(), `stagehand-evals-antigravity-${toolSurface.replace(/_/gu, "-")}-`),
    );
    const capturedCwd = cwd;
    const { mcpConfigPath, agentPath } = await writeAntigravityWorkspace(cwd, mount.mcpServers);
    const mcpServerNames = Object.keys(mount.mcpServers);
    const recorder = runtime.running.captureEvidence
      ? new ObservationRecorder(runtime.running.captureEvidence)
      : undefined;
    const observedToolMatcher = (name: string): boolean =>
      isAntigravityMountToolName(mcpServerNames, name);
    let cleanupPromise: Promise<void> | undefined;

    input.logger.log({
      category: "antigravity",
      message: `Initialized ${toolSurface} MCP mount for Antigravity (servers: ${mcpServerNames.join(", ")}).`,
      level: 1,
      auxiliary: {
        startupProfile: { value: startupProfile, type: "string" },
        environment: { value: input.environment, type: "string" },
      },
    });

    return {
      toolSurface,
      startupProfile,
      cwd,
      env: stringEnv(process.env),
      mcpConfigPath,
      agentPath,
      mcpServerNames,
      promptInstructions: mount.promptInstructions,
      ...(runtime.running.captureEvidence && {
        captureEvidence: boundedCaptureEvidence(runtime.running.captureEvidence),
      }),
      ...(recorder && {
        drainStepObservations: async () => {
          await recorder.settle();
          return recorder.drain();
        },
        onToolResult: (toolName: string) => {
          if (observedToolMatcher(toolName)) void recorder.record();
        },
      }),
      observedToolMatcher,
      cleanup: async () => {
        cleanupPromise ??= (async () => {
          try {
            await withTimeout(
              runtime.cleanup(),
              readPositiveIntEnv("EVAL_AGENT_MOUNT_CLEANUP_TIMEOUT_MS", 30_000),
            );
          } catch {
            // Best effort only.
          } finally {
            await fsp.rm(capturedCwd, { recursive: true, force: true });
          }
        })();
        await cleanupPromise;
      },
    };
  } catch (error) {
    await withTimeout(
      runtime.cleanup(),
      readPositiveIntEnv("EVAL_AGENT_MOUNT_CLEANUP_TIMEOUT_MS", 30_000),
    ).catch((): undefined => undefined);
    if (cwd) await fsp.rm(cwd, { recursive: true, force: true });
    throw error;
  }
}

function boundedCaptureEvidence(
  capture: () => Promise<ProbeEvidence>,
): () => Promise<ProbeEvidence> {
  return async () => {
    try {
      return await withTimeout(
        capture(),
        readPositiveIntEnv("EVAL_CAPTURE_EVIDENCE_TIMEOUT_MS", 15_000),
      );
    } catch {
      return {};
    }
  };
}

function readPositiveIntEnv(key: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`antigravity adapter operation timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
