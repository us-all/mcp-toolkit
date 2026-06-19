import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export type { ToolAnnotations };

/**
 * Derive MCP tool annotations (readOnlyHint / destructiveHint / openWorldHint)
 * from a tool's kebab-case name, so every `@us-all/*` server can advertise the
 * standard hints from a single place instead of hand-annotating each tool.
 *
 * Strategy — conservative by construction:
 *   - Default is read-only. Only a curated set of mutating verbs flips
 *     `readOnlyHint` to false, so a tool is never *wrongly* advertised as safe
 *     unless its verb is unknown to us (in which case the caller should pass an
 *     override). The annotations are advisory hints (the MCP spec says clients
 *     MUST NOT make security-critical decisions on them alone), but we still aim
 *     for the safe direction: under-claiming read-only beats over-claiming it.
 *   - `openWorldHint` is true for all of these servers — they talk to external
 *     systems (Datadog, OpenMetadata, Airflow, a device, a SaaS API), never a
 *     closed in-process world.
 *
 * Naming quirks the verb extraction handles:
 *   - Namespace prefixes (`dbt-`, `airflow-`, `dq-`, `docs-`, `sheets-`,
 *     `slides-`) where the real verb is the *next* token.
 *   - A `batch-` wrapper after the namespace (`sheets-batch-update-values`).
 *
 * For the handful of names the heuristic can't get right (e.g.
 * `sheets-find-replace`, `sheets-auto-resize`), pass an explicit `overrides`
 * object at the call site — it wins over the inference.
 */

const NAMESPACE_PREFIXES = new Set([
  "dbt",
  "airflow",
  "dq",
  "docs",
  "sheets",
  "slides",
]);

/** Verbs that mutate state → readOnlyHint:false. */
const WRITE_VERBS = new Set([
  // generic CRUD + lifecycle
  "create", "update", "delete", "set", "add", "remove", "run", "trigger",
  "clear", "cancel", "restore", "rename", "transition", "finalize", "suggest",
  "log", "test", "mute", "unmute", "publish", "unpublish", "send", "post",
  "install", "uninstall", "apply", "enable", "disable", "start", "stop",
  "reboot", "mark", "rotate", "configure", "upgrade", "deploy", "schedule",
  "resolve", "complete", "execute", "write", "put", "patch",
  // document / spreadsheet / slides mutations
  "insert", "replace", "append", "merge", "unmerge", "duplicate", "move",
  "copy", "share", "resize", "sort", "format", "protect", "manage",
  // device / UI control
  "connect", "disconnect", "grant", "revoke", "change", "toggle", "load",
  "save", "launch", "lock", "unlock", "keep", "port", "reverse", "tap",
  "swipe", "scroll", "push", "pull", "input", "broadcast", "press", "drag",
  "drop", "type", "fill", "navigate", "edit", "open", "close", "double",
  "long", "click", "hover",
  // collaboration
  "invite", "join", "leave", "kick", "archive", "unarchive", "bookmark",
  "pin", "react",
]);

/** Subset of writes that may destroy or remove data → destructiveHint:true. */
const DESTRUCTIVE_VERBS = new Set([
  "delete", "remove", "uninstall", "clear", "cancel", "drop", "purge",
  "reset", "revoke", "kick", "archive", "unpublish", "wipe",
]);

/** Extract the meaningful verb from a kebab-case tool name. */
export function toolVerb(name: string): string {
  let parts = name.toLowerCase().split("-").filter(Boolean);
  if (parts.length > 1 && NAMESPACE_PREFIXES.has(parts[0])) {
    parts = parts.slice(1);
  }
  if (parts.length > 1 && parts[0] === "batch") {
    parts = parts.slice(1); // batch-update-values → update
  }
  return parts[0] ?? "";
}

/**
 * Infer a tool's annotations from its name. `overrides` are merged last and win,
 * so a call site can correct any misclassification field-by-field.
 */
export function inferToolAnnotations(
  name: string,
  overrides: ToolAnnotations = {},
): ToolAnnotations {
  const verb = toolVerb(name);
  const isWrite = WRITE_VERBS.has(verb);

  const annotations: ToolAnnotations = {
    readOnlyHint: !isWrite,
    openWorldHint: true,
  };
  if (isWrite && DESTRUCTIVE_VERBS.has(verb)) {
    annotations.destructiveHint = true;
  }

  return { ...annotations, ...overrides };
}
