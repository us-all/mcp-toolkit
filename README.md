# @us-all/mcp-toolkit

> **The 4 patterns that survive in production across 6 MCP servers.**
>
> Token-efficient defaults, pluggable error redaction, declarative aggregation, and tool-discovery meta — extracted from 6 consumer servers. Single evolution point. Cascade-automated to all consumers.

[![npm](https://img.shields.io/npm/v/@us-all/mcp-toolkit)](https://www.npmjs.com/package/@us-all/mcp-toolkit)
[![downloads](https://img.shields.io/npm/dm/@us-all/mcp-toolkit)](https://www.npmjs.com/package/@us-all/mcp-toolkit)
[![tests](https://img.shields.io/badge/tests-54-green)](./tests)
[![@us-all standard](https://img.shields.io/badge/standard-STANDARD.md-blue)](./STANDARD.md)

## When to use this

- You're starting a new MCP server and want token-efficient defaults from day 1.
- Your existing server is past ~100 tools and clients (Cursor, Claude Desktop) start struggling with the tool list.
- You have multiple MCP servers and don't want each to reinvent slim-projection / category toggles / error redaction / aggregation boilerplate.
- You want a `search-tools` meta-tool so the LLM discovers tools at runtime instead of preloading every schema.

If your MCP has fewer than 20 tools and one auth mode, you probably don't need this — just ship.

## The 4 patterns

```ts
import {
  applyExtractFields,        // token-efficient response projection
  ToolRegistry,              // category toggles + search-tools
  createWrapToolHandler,     // pluggable error redaction + structured errors
  // and:
} from "@us-all/mcp-toolkit";
import { aggregate } from "@us-all/mcp-toolkit/aggregate";
```

### 1. `applyExtractFields` — token-efficient projection

Comma-separated dotted paths with `*` wildcards. Slim large reads to what the model needs.

```ts
import { applyExtractFields } from "@us-all/mcp-toolkit/extract-fields";

const dashboard = { id: "abc", title: "...", widgets: [{ definition: { type: "timeseries", queries: [...] } }] };
applyExtractFields(dashboard, "id,title,widgets.*.definition.type");
// → { id: "abc", title: "...", widgets: [{ definition: { type: "timeseries" } }] }
```

When wired through `createWrapToolHandler`, tools whose schemas declare `extractFields` get caller-supplied projection automatically. MCP SDK validation drops undeclared fields, so each consumer must opt in per tool schema or use an explicit passthrough schema.

### 2. `ToolRegistry<TCategory>` + `search-tools`

Track tools by category. Pair with `<PREFIX>_TOOLS` / `<PREFIX>_DISABLE` env vars to load only relevant categories — biggest LLM context token saver.

```ts
import { ToolRegistry, parseEnvList, createSearchToolsMetaTool } from "@us-all/mcp-toolkit";

const CATEGORIES = ["metrics", "monitors", "logs", "meta"] as const;
type Category = (typeof CATEGORIES)[number];

const registry = new ToolRegistry<Category>({
  enabledCategories: parseEnvList(process.env.DD_TOOLS),
  disabledCategories: parseEnvList(process.env.DD_DISABLE),
});

let currentCategory: Category = "metrics";
function tool(name: string, desc: string, schema: any, handler: any) {
  registry.register(name, desc, currentCategory);
  if (registry.isEnabled(currentCategory)) server.tool(name, desc, schema, handler);
}

// Always-on meta-tool: lets the LLM discover other tools at runtime
const meta = createSearchToolsMetaTool(registry, CATEGORIES);
currentCategory = "meta";
tool("search-tools", "Discover tools by query", meta.schema.shape, wrapToolHandler(meta.handler));
```

Real-world impact (datadog, 165 tools): default load = 25K schema tokens; `DD_TOOLS=metrics,monitors` = 3.8K (−85%).

### 3. `createWrapToolHandler` — error redaction + structured errors

Replaces the `tools/utils.ts` boilerplate that 6 consumer repos all reinvented.

```ts
import { createWrapToolHandler } from "@us-all/mcp-toolkit";

const wrapToolHandler = createWrapToolHandler({
  redactionPatterns: [/DD_API_KEY/i],   // merged with built-in defaults
  errorExtractors: [
    {
      match: (e) => e instanceof WriteBlockedError,
      extract: (e) => ({ kind: "passthrough", text: (e as Error).message }),
    },
    {
      match: (e) => e instanceof DatadogApiError,
      extract: (e) => ({
        kind: "structured",
        data: { message: e.message, status: e.code, details: e.body },
      }),
    },
  ],
});
```

Built-in redactions: `api_key`, `app_key`, `authorization`, `bearer …`, `password`, `secret`, `token`. Use the bare `wrapToolHandler` export for zero-config.

### 4. `aggregate(fetchers, caveats, formatReason?)` — declarative aggregation

For tools that fan out 3–7 sequential API calls into one structured response. Replaces the `Promise.allSettled` + per-slot `caveats.push(...)` block that consumers all repeated.

```ts
import { aggregate } from "@us-all/mcp-toolkit/aggregate";

const caveats: string[] = [];
const result = await aggregate(
  {
    monitor: () => api.getMonitor(id),
    state: () => api.getMonitorState(id),
    events: () => api.searchEvents({ monitorId: id, window: "30m" }),
    downtimes: () => api.listDowntimes({ monitorId: id }),
  },
  caveats,
);
// result: { monitor, state, events, downtimes } — null per slot on failure
// caveats: ["state failed: timeout", ...] — surfaces partial failures
```

Type inferred from the input object. Rejected slots become `null`. `formatReason` lets callers customize caveat strings.

## Install

```bash
pnpm add @us-all/mcp-toolkit
# peer deps
pnpm add @modelcontextprotocol/sdk zod
```

Node 22+, ESM, TypeScript strict. Peer SDK: `^1.27 || ^1.28 || ^1.29`.

Sub-exports for tree-shaking:
- `@us-all/mcp-toolkit` — main barrel
- `@us-all/mcp-toolkit/extract-fields`
- `@us-all/mcp-toolkit/registry`
- `@us-all/mcp-toolkit/wrap-tool-handler`
- `@us-all/mcp-toolkit/aggregate`

## Cascade automation

`.github/workflows/cascade-bump.yml` — when toolkit publishes, opens an automated PR in each of the 6 consumer repos that:
- bumps the `@us-all/mcp-toolkit` dep pin to the new version
- bumps the consumer's PATCH version
- runs `pnpm install` + build + test (PR creation gated on success)
- inserts a "최근 변경사항" entry in CLAUDE.md

PRs are not auto-merged — humans gate each consumer release. Re-run safe (skips if already pinned).

Auth: GitHub App `us-all-bot` (per-matrix-job installation token, no PAT, no expiry, scoped install). Setup walkthrough in [CLAUDE.md](./CLAUDE.md#cascade-자동화).

## Consumer suite (proof of concept)

Six production servers built on this toolkit. All MIT, distributed via npm under `@us-all/*`, [searchable on the MCP Server Registry](https://registry.modelcontextprotocol.io/) under `io.github.us-all/*`, and listed on [Glama](https://glama.ai/mcp).

| Server | Tools | npm/mo | Registry namespace |
|---|--:|--:|---|
| [@us-all/datadog-mcp](https://github.com/us-all/datadog-mcp-server) | 165 | 5,010 | `io.github.us-all/datadog` |
| [@us-all/openmetadata-mcp](https://github.com/us-all/openmetadata-mcp-server) | 170 | 3,122 | `io.github.us-all/openmetadata` |
| [@us-all/google-drive-mcp](https://github.com/us-all/google-drive-mcp-server) | 98 | 3,243 | `io.github.us-all/google-drive` |
| [@us-all/mlflow-mcp](https://github.com/us-all/mlflow-mcp-server) | 82 | 2,717 | `io.github.us-all/mlflow` |
| [@us-all/android-mcp](https://github.com/us-all/android-mcp-server) | 76 | 2,405 | `io.github.us-all/android` |
| [@us-all/unifi-mcp](https://github.com/us-all/unifi-mcp-server) | 54 | 2,566 | `io.github.us-all/unifi` |

~990 LOC of duplicated boilerplate eliminated across the suite at v0.1.0–v1.0.0 migrations.

## STANDARD.md

[STANDARD.md](./STANDARD.md) is the *why* — the conventions and rationale. This package is the *how*. New MCP authors read STANDARD.md first; experienced ones go straight to the API.

## Testing

```bash
pnpm install
pnpm build
pnpm test     # 54 unit tests
```

Coverage: extract-fields edges (wildcards, backtick keys, array projection), registry semantics (allowlist/denylist, search matching), wrap-tool-handler (success/error paths, custom redaction, errorExtractors), aggregate (success/reject mix, custom formatReason, concurrency).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). New shared patterns belong here — single source of truth for the @us-all suite.

## License

[MIT](./LICENSE)
