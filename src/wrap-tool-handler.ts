/**
 * Tool handler wrapper factory — error sanitization, structured error responses,
 * and automatic `extractFields` projection on success.
 *
 * Each consumer MCP server has its own auth/error class shapes; pass them via
 * `errorExtractors`. The shared core handles MCP response shaping + redaction.
 */

import { applyExtractFields } from "./extract-fields.js";

export type ToolTextResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type StructuredError = Record<string, unknown> & { message: string };

/**
 * Result returned by an `ErrorExtractor`.
 * - `structured`: build a JSON-stringified MCP error response (sanitized by default).
 * - `passthrough`: return the raw text as-is, no JSON wrap, no sanitization.
 *   Use for cases where the message is already safe and JSON wrapping would
 *   degrade UX (e.g. `WriteBlockedError`).
 */
export type ErrorHandling =
  | { kind: "structured"; data: StructuredError; sanitize?: boolean }
  | { kind: "passthrough"; text: string };

export interface ErrorExtractor {
  match: (error: unknown) => boolean;
  extract: (error: unknown) => ErrorHandling;
}

export interface CreateWrapToolHandlerOptions {
  /**
   * Regex patterns merged with `DEFAULT_REDACTION_PATTERNS`. Matches are replaced
   * with `[REDACTED]` in error messages and structured error string fields.
   */
  redactionPatterns?: RegExp[];

  /**
   * Ordered list of custom error extractors. The first matching extractor wins.
   * Falls back to a generic `{ message: error.message }` shape when none match.
   */
  errorExtractors?: ErrorExtractor[];

  /** Param name read for auto field projection on success. Default: `extractFields`. */
  extractFieldsParam?: string;
}

/** Common secret patterns redacted by default. */
export const DEFAULT_REDACTION_PATTERNS: readonly RegExp[] = Object.freeze([
  /api[_-]?key/i,
  /app[_-]?key/i,
  /authorization/i,
  /bearer\s+\S+/i,
  /password/i,
  /secret/i,
  /token/i,
]);

function sanitizeText(text: string, patterns: readonly RegExp[]): string {
  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

function sanitizeStructured(
  data: StructuredError,
  patterns: readonly RegExp[],
): StructuredError {
  const out: StructuredError = { message: sanitizeText(data.message, patterns) };
  for (const [key, value] of Object.entries(data)) {
    if (key === "message") continue;
    out[key] = typeof value === "string" ? sanitizeText(value, patterns) : value;
  }
  return out;
}

/**
 * Build a wrapToolHandler tailored to a consumer MCP server.
 *
 * @example
 * ```ts
 * const wrapToolHandler = createWrapToolHandler({
 *   redactionPatterns: [/DD_API_KEY/i],
 *   errorExtractors: [
 *     {
 *       match: (e) => e instanceof WriteBlockedError,
 *       extract: (e) => ({ kind: "passthrough", text: (e as Error).message }),
 *     },
 *     {
 *       match: (e) => e instanceof DatadogApiError,
 *       extract: (e) => {
 *         const err = e as DatadogApiError;
 *         return { kind: "structured", data: { message: err.message, status: err.code } };
 *       },
 *     },
 *   ],
 * });
 * ```
 */
export function createWrapToolHandler(opts: CreateWrapToolHandlerOptions = {}) {
  const patterns: readonly RegExp[] = [
    ...DEFAULT_REDACTION_PATTERNS,
    ...(opts.redactionPatterns ?? []),
  ];
  const extractors = opts.errorExtractors ?? [];
  const fieldParam = opts.extractFieldsParam ?? "extractFields";

  return function wrapToolHandler<T>(fn: (params: T) => Promise<unknown>) {
    return async (params: T): Promise<ToolTextResult> => {
      try {
        const result = await fn(params);
        const expr = (params as Record<string, unknown> | undefined)?.[fieldParam];
        const projected =
          typeof expr === "string" ? applyExtractFields(result, expr) : result;
        return {
          content: [{ type: "text", text: JSON.stringify(projected, null, 2) }],
        };
      } catch (error) {
        for (const ex of extractors) {
          if (!ex.match(error)) continue;
          const handling = ex.extract(error);
          if (handling.kind === "passthrough") {
            return {
              content: [{ type: "text", text: handling.text }],
              isError: true,
            };
          }
          const data =
            handling.sanitize === false
              ? handling.data
              : sanitizeStructured(handling.data, patterns);
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            isError: true,
          };
        }

        const fallback: StructuredError = {
          message:
            error instanceof Error
              ? sanitizeText(error.message, patterns)
              : sanitizeText(String(error), patterns),
        };
        return {
          content: [{ type: "text", text: JSON.stringify(fallback, null, 2) }],
          isError: true,
        };
      }
    };
  };
}

/** Default-configured wrapper — uses only built-in redaction patterns. */
export const wrapToolHandler = createWrapToolHandler();
