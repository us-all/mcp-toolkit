# @us-all/mcp-toolkit

> **The 4 patterns that survive in production across 7 MCP servers.**
>
> Token-efficient defaults, pluggable error redaction, declarative aggregation, and tool-discovery meta — extracted from 6 consumer servers (datadog 159 tools, openmetadata 156, google-drive 96, mlflow 66, android 75, unifi 45). Single evolution point. Cascade-automated to all consumers.

[![npm](https://img.shields.io/npm/v/@us-all/mcp-toolkit)](https://www.npmjs.com/package/@us-all/mcp-toolkit)
[![downloads](https://img.shields.io/npm/dm/@us-all/mcp-toolkit)](https://www.npmjs.com/package/@us-all/mcp-toolkit)
[![tests](https://img.shields.io/badge/tests-47-green)](./tests)
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

When wired through `createWrapToolHandler`, every tool gets an optional `extractFields` parameter automatically — caller-supplied projection takes precedence over the tool's default.

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

Real-world impact (datadog, 159 tools): default load = 25K schema tokens; `DD_TOOLS=metrics,monitors` = 3.8K (−85%).

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

Node 18+, ESM, TypeScript strict. Peer SDK: `^1.27 || ^1.28 || ^1.29`.

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

| Server | Tools | npm/mo | Adopted | Status |
|---|--:|--:|---|---|
| [@us-all/datadog-mcp](https://github.com/us-all/datadog-mcp-server) | 159 | 3,887 | v1.12.0+ | full |
| [@us-all/openmetadata-mcp](https://github.com/us-all/openmetadata-mcp-server) | 156 | 2,322 | v1.7.0+ | full |
| [@us-all/google-drive-mcp](https://github.com/us-all/google-drive-mcp-server) | 96 | 2,386 | v1.8.0+ | full |
| [@us-all/android-mcp](https://github.com/us-all/android-mcp-server) | 75 | 1,679 | v1.7.0+ | full |
| [@us-all/mlflow-mcp](https://github.com/us-all/mlflow-mcp-server) | 66 | 2,036 | v1.6.0+ | full |
| [@us-all/unifi-mcp](https://github.com/us-all/unifi-mcp-server) | 45 | 1,769 | v1.5.0+ | full |

~990 LOC of duplicated boilerplate eliminated across the suite at v0.1.0–v1.0.0 migrations.

## STANDARD.md

[STANDARD.md](./STANDARD.md) is the *why* — the conventions and rationale. This package is the *how*. New MCP authors read STANDARD.md first; experienced ones go straight to the API.

## Testing

```bash
pnpm install
pnpm build
pnpm test     # 47 unit tests
```

Coverage: extract-fields edges (wildcards, backtick keys, array projection), registry semantics (allowlist/denylist, search matching), wrap-tool-handler (success/error paths, custom redaction, errorExtractors), aggregate (success/reject mix, custom formatReason, concurrency).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). New shared patterns belong here — single source of truth for the @us-all suite.

## License

[MIT](./LICENSE)
