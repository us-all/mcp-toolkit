/**
 * Server runtime — single entry point for stdio and Streamable HTTP transports.
 *
 * Consumers replace the boilerplate at the bottom of their `index.ts`
 * (`new StdioServerTransport`, `server.connect`, error handling) with one call:
 *
 * ```ts
 * await startMcpServer(server);
 * ```
 *
 * Transport is selected by `MCP_TRANSPORT` env (`stdio` | `http`), defaulting to `stdio`.
 * In `http` mode, requires `MCP_HTTP_TOKEN` for Bearer auth (or `MCP_HTTP_SKIP_AUTH=true`).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const LOCALHOST_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export type TransportKind = "stdio" | "http";

export interface StartMcpServerOptions {
  /** Force a transport kind. Default: read `MCP_TRANSPORT`, fall back to `stdio`. */
  transport?: TransportKind;
  /** HTTP port. Default: `MCP_HTTP_PORT` or `3000`. Pass `0` to let the OS pick. */
  port?: number;
  /** HTTP bind host. Default: `MCP_HTTP_HOST` or `127.0.0.1`. */
  host?: string;
  /** Bearer token. Default: `MCP_HTTP_TOKEN`. Required in HTTP mode unless `skipAuth`. */
  token?: string;
  /** Skip auth even when no token is set. Default: `MCP_HTTP_SKIP_AUTH`. */
  skipAuth?: boolean;
  /**
   * Allowed `Host` header values for DNS rebinding protection. Default: when bound
   * to a localhost address, the protection is auto-enabled with sensible defaults.
   * Pass an explicit list to override.
   */
  allowedHosts?: string[];
}

export interface HttpHandle {
  /** The actual port the server is listening on (useful when port is `0`). */
  port: number;
  /** Stops accepting new connections and closes the underlying transport. */
  close: () => Promise<void>;
}

function resolveTransport(opt?: TransportKind): TransportKind {
  if (opt) return opt;
  const env = process.env.MCP_TRANSPORT?.toLowerCase();
  return env === "http" ? "http" : "stdio";
}

function resolveBoolEnv(name: string): boolean | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  const lower = v.toLowerCase();
  if (lower === "true" || lower === "1") return true;
  if (lower === "false" || lower === "0") return false;
  return undefined;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Connect the MCP server to the configured transport.
 *
 * - `stdio` (default): starts a `StdioServerTransport` and returns once connected.
 *   The promise resolves to `void`; the process stays alive via the open stdio.
 * - `http`: starts a Node http server hosting `/mcp` (POST/GET/DELETE) for Streamable
 *   HTTP transport plus a public `/health` endpoint, and returns a handle for inspecting
 *   the bound port and shutting down. Bearer auth via `MCP_HTTP_TOKEN`.
 *
 * Concurrent requests share a single stateless `StreamableHTTPServerTransport` instance,
 * which is the documented pattern for `sessionIdGenerator: undefined` mode.
 */
export async function startMcpServer(
  server: McpServer,
  opts: StartMcpServerOptions = {},
): Promise<HttpHandle | void> {
  const kind = resolveTransport(opts.transport);

  if (kind === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP server running on stdio");
    return;
  }

  const port = opts.port ?? Number(process.env.MCP_HTTP_PORT ?? 3000);
  const host = opts.host ?? process.env.MCP_HTTP_HOST ?? "127.0.0.1";
  const token = opts.token ?? process.env.MCP_HTTP_TOKEN;
  const skipAuth = opts.skipAuth ?? resolveBoolEnv("MCP_HTTP_SKIP_AUTH") ?? false;

  if (!skipAuth && !token) {
    throw new Error(
      "HTTP transport requires MCP_HTTP_TOKEN (or set MCP_HTTP_SKIP_AUTH=true / opts.skipAuth=true).",
    );
  }

  const isLocalhost = LOCALHOST_HOSTS.has(host);
  let transport: StreamableHTTPServerTransport | undefined;

  const httpServer: Server = createServer(async (req, res) => {
    try {
      const path = (req.url ?? "/").split("?")[0];

      if (path === "/health") {
        writeJson(res, 200, { status: "ok", transport: "http" });
        return;
      }

      if (path !== "/mcp") {
        writeJson(res, 404, { error: "not found" });
        return;
      }

      if (!skipAuth) {
        const header = req.headers.authorization;
        if (header !== `Bearer ${token}`) {
          writeJson(res, 401, { error: "unauthorized" });
          return;
        }
      }

      if (!transport) {
        writeJson(res, 503, { error: "transport not ready" });
        return;
      }

      await transport.handleRequest(req as IncomingMessage, res);
    } catch (err) {
      if (!res.headersSent) {
        writeJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        res.end();
      }
    }
  });

  return new Promise<HttpHandle>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, async () => {
      try {
        const address = httpServer.address();
        const boundPort =
          typeof address === "object" && address ? address.port : port;
        const allowedHosts =
          opts.allowedHosts ??
          (isLocalhost
            ? [
                `${host}:${boundPort}`,
                `localhost:${boundPort}`,
                `127.0.0.1:${boundPort}`,
              ]
            : undefined);
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableDnsRebindingProtection: allowedHosts !== undefined,
          allowedHosts,
        });
        await server.connect(transport);
        const authState = skipAuth ? " (auth disabled)" : "";
        console.error(`MCP server running on http://${host}:${boundPort}/mcp${authState}`);
        resolve({
          port: boundPort,
          close: () =>
            new Promise<void>((res, rej) => {
              transport?.close().catch(() => {});
              httpServer.close((err?: Error) => (err ? rej(err) : res()));
            }),
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}
