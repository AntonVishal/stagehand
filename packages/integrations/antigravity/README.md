# Antigravity CLI with Stagehand browser tools

This directory configures the Antigravity CLI to use the Stagehand facade as a workspace MCP
server. One facade process owns the browser for the full CLI session, so `run`, `snapshot`, and
`screenshot` share page state and snapshot IDs.

## Setup

Install Antigravity CLI and sign in once:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy
```

From the repository root, install dependencies and build the facade:

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter @browserbasehq/stagehand-integrations
```

The example uses local Chrome when `BROWSERBASE_API_KEY` is unset. To use Browserbase instead:

```bash
export STAGEHAND_BROWSER="browserbase"
export BROWSERBASE_API_KEY="your-browserbase-api-key"
```

Start Antigravity from this directory so it discovers `.agents/mcp_config.json` and the
workspace-scoped `stagehand` agent:

```bash
cd packages/integrations/antigravity
agy --agent stagehand
```

For a one-shot headless task:

```bash
agy -p \
  "Open https://example.com, take a snapshot, and report the page title." \
  --agent stagehand \
  --sandbox \
  --disable-slash-commands \
  --dangerously-skip-permissions
```

The workspace-scoped `stagehand` agent is MCP-only. Its frontmatter sets `inheritMcp: true` and
lists `stagehand__run`, `stagehand__snapshot`, and `stagehand__screenshot`. Empty `tools: []`
still leaves built-ins such as `search_web` visible, so the allowlist is explicit.

`--dangerously-skip-permissions` approves every remaining tool call. Use it only with a trusted prompt and
keep `--sandbox` enabled. For interactive runs, omit the flag and approve the Stagehand MCP tools
as the CLI requests them.

If a headless `init.tools` event still lists built-in tools, or lists no Stagehand MCP tools, the
eval harness fails the run. Set `EVAL_ANTIGRAVITY_EXPLICIT_MCP_TOOLS=1` to put
`stagehand__run`, `stagehand__snapshot`, and `stagehand__screenshot` in the agent `tools` list.

## Configuration

| Variable                  | Purpose                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `STAGEHAND_BROWSER`       | Select `local` or `browserbase`. Browserbase is inferred when its API key is present. |
| `BROWSERBASE_API_KEY`     | Required for Browserbase.                                                             |
| `BROWSERBASE_PROJECT_ID`  | Optional Browserbase project ID.                                                      |
| `STAGEHAND_MODEL_NAME`    | Optional model for Stagehand AI methods called inside `run`.                          |
| `STAGEHAND_MODEL_API_KEY` | Credential for `STAGEHAND_MODEL_NAME`.                                                |
| `EVAL_ANTIGRAVITY_EXPLICIT_MCP_TOOLS` | Set to `1` if empty `tools:` plus `inheritMcp` hides the Stagehand MCP tools. |

Antigravity authentication stays in the CLI's cached login. It is separate from the optional
Stagehand model credential.

## Adapting the configuration

The checked-in MCP command is relative to this directory. When copying the configuration to
another project, replace `../core/dist/facade/stdio-server.mjs` with the absolute path to the
built facade server.

Keep one MCP process alive for the whole agent session. Starting a new facade for each tool call
starts a new browser and invalidates earlier snapshot IDs.

## Troubleshooting

- If `agy` asks you to sign in during a headless run, launch `agy` interactively under the same
  user account first. Do not replace `HOME`; Antigravity stores its login in the host profile.
- If the `stagehand` agent or its tools are missing, start `agy` from this directory and confirm
  `.agents/mcp_config.json` and `.agents/agents/stagehand/agent.md` are present.
- If the MCP server exits immediately, rebuild `@browserbasehq/stagehand-integrations` and confirm
  `../core/dist/facade/stdio-server.mjs` exists relative to this directory.
- If local Chrome cannot start, install Chrome or switch to Browserbase with
  `STAGEHAND_BROWSER=browserbase` and a valid `BROWSERBASE_API_KEY`.
- If a headless run uses `search_web` or `read_url_content` instead of Stagehand, confirm
  `.agents/agents/stagehand/agent.md` has `tools: []` and `inheritMcp: true`. If MCP tools are
  missing from the stream-json `init.tools` list, set `EVAL_ANTIGRAVITY_EXPLICIT_MCP_TOOLS=1`.
