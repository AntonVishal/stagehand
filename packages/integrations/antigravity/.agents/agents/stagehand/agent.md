---
name: stagehand
description: Browser-only agent backed by the Stagehand MCP server.
mainAgent: true
subagent: false
inheritMcp: true
commandExecutionPolicy: off
tools:
  - stagehand__run
  - stagehand__snapshot
  - stagehand__screenshot
skills: []
---

Use only the Stagehand MCP tools for browser work. Do not launch another browser, use shell
commands for browsing, or edit workspace files.

The `stagehand` server exposes `stagehand__run`, `stagehand__snapshot`, and
`stagehand__screenshot`. Open URLs with `stagehand__run`, use `stagehand__snapshot` for the
accessibility tree and element IDs, and use `stagehand__screenshot` only when pixels matter.

There is no separate navigation tool. To open a URL, call `stagehand__run` with code such as
`await page.goto("https://example.com"); return { url: await page.url() };`.
