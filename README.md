# @us-all/mcp-toolkit

Shared building blocks for `@us-all/*` MCP servers — extracted from production patterns proven across [datadog-mcp](https://github.com/us-all/datadog-mcp-server), [openmetadata-mcp](https://github.com/us-all/openmetadata-mcp-server), [google-drive-mcp](https://github.com/us-all/google-drive-mcp-server), [mlflow-mcp](https://github.com/us-all/mlflow-mcp-server), [unifi-mcp](https://github.com/us-all/unifi-mcp-server), [android-mcp](https://github.com/us-all/android-mcp-server).

See the [@us-all MCP Standard](https://github.com/us-all/mcp-toolkit/blob/main/STANDARD.md) for context on why these patterns matter.

## Install

```bash
pnpm add @us-all/mcp-toolkit
# peer deps
pnpm add @modelcontextprotocol/sdk zod
```

## Exports

### `applyExtractFields(data, expr?)`

Field projection helper for response token reduction. Comma-separated dotted paths with `*` wildcard.

```ts
import { applyExtractFields } from "@us-all/mcp-toolkit/extract-fields";

const tableResponse = { id: "1", columns: [{ name: "id", type: "INT", nullable: false, ... }] };
applyExtractFields(tableResponse, "id,columns.*.name");
// → { id: "1", columns: [{ name: "id" }] }
```

### `createWrapToolHandler(options?)`

Factory that returns a `wrapToolHandler<T>(fn)` matching the @us-all standard: 2-space JSON output, automatic `extractFields` projection on success, regex redaction on errors, and pluggable custom-error matching. Replaces `tools/utils.ts` boilerplate across consumer repos.

```ts
import { createWrapToolHandler } from "@us-all/mcp-toolkit";

const wrapToolHandler = createWrapToolHandler({
  redactionPatterns: [/DD_API_KEY/i],            // merged with built-in defaults
  errorExtractors: [
    {
      match: (e) => e instanceof WriteBlockedError,
      extract: (e) => ({ kind: "passthrough", text: (e as Error).message }),
    },
    {
      match: (e) => e instanceof DatadogApiError,
      extract: (e) => {
        const err = e as DatadogApiError;
        return {
          kind: "structured",
          data: { message: err.message, status: err.code, details: err.body },
        };
      },
    },
  ],
});
```

Defaults redact `api_key`, `app_key`, `authorization`, `bearer …`, `password`, `secret`, `token`. Use the bare `wrapToolHandler` export for a zero-config wrapper.

### `ToolRegistry<TCategory>`

Track registered tools by category. Pair with `<PREFIX>_TOOLS` / `<PREFIX>_DISABLE` env vars to load only relevant categories — biggest LLM context token saver.

```ts
import { ToolRegistry, parseEnvList } from "@us-all/mcp-toolkit";

const CATEGORIES = ["metrics", "monitors", "logs", "meta"] as const;
type Category = (typeof CATEGORIES)[number];

const registry = new ToolRegistry<Category>({
  enabledCategories: parseEnvList(process.env.DD_TOOLS),
  disabledCategories: parseEnvList(process.env.DD_DISABLE),
});

let currentCategory: Category = "metrics";
function tool(name: string, desc: string, schema: any, handler: any) {
  registry.register(name, desc, currentCategory);
  if (registry.isEnabled(currentCategory)) {
    server.tool(name, desc, schema, handler);
  }
}
```

### `createSearchToolsMetaTool(registry, categories, hint?)`

Factory for the `search-tools` meta-tool — natural-language tool discovery across all registered tools (regardless of category toggles).

```ts
import { createSearchToolsMetaTool } from "@us-all/mcp-toolkit";

const meta = createSearchToolsMetaTool(registry, CATEGORIES);
currentCategory = "meta";
tool("search-tools", "Discover tools by query", meta.schema.shape, wrapToolHandler(meta.handler));
```

## Testing

```bash
pnpm install
pnpm build
pnpm test
```

36 unit tests covering edge cases (wildcards, backtick-quoted keys, array projection, allowlist/denylist semantics, meta-tool factory, error redaction, custom error extractors).

## License

MIT
