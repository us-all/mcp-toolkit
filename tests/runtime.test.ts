import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { startMcpServer, type HttpHandle } from "../src/runtime.js";

function makeServer(): McpServer {
  const server = new McpServer({ name: "runtime-test", version: "0.0.0" });
  server.registerTool(
    "echo",
    {
      description: "echo back the message",
      inputSchema: z.object({ message: z.string() }),
    },
    async ({ message }) => ({ content: [{ type: "text", text: message }] }),
  );
  return server;
}

async function rpc(handle: HttpHandle, body: object, headers: Record<string, string> = {}) {
  return fetch(`http://127.0.0.1:${handle.port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("startMcpServer — env / option resolution", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("MCP_")) delete process.env[k];
    }
    Object.assign(process.env, originalEnv);
  });

  it("throws when http requested without auth", async () => {
    process.env.MCP_TRANSPORT = "http";
    delete process.env.MCP_HTTP_TOKEN;
    delete process.env.MCP_HTTP_SKIP_AUTH;
    await expect(startMcpServer(makeServer())).rejects.toThrow(/MCP_HTTP_TOKEN/);
  });

  it("opts.skipAuth allows starting without token", async () => {
    const handle = (await startMcpServer(makeServer(), {
      transport: "http",
      port: 0,
      skipAuth: true,
    })) as HttpHandle;
    expect(handle.port).toBeGreaterThan(0);
    await handle.close();
  });
});

describe("startMcpServer — http transport", () => {
  let handle: HttpHandle;
  const TOKEN = "test-bearer-secret";

  beforeEach(async () => {
    handle = (await startMcpServer(makeServer(), {
      transport: "http",
      port: 0,
      token: TOKEN,
    })) as HttpHandle;
  });

  afterEach(async () => {
    await handle.close();
  });

  it("returns 401 on missing Authorization header", async () => {
    const res = await rpc(handle, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 on wrong token", async () => {
    const res = await rpc(
      handle,
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { authorization: "Bearer wrong-token" },
    );
    expect(res.status).toBe(401);
  });

  it("accepts valid bearer + responds to initialize", async () => {
    const init = await rpc(
      handle,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test-client", version: "0.0.0" },
        },
      },
      { authorization: `Bearer ${TOKEN}` },
    );
    expect(init.status).toBe(200);
    const text = await init.text();
    expect(text).toContain("runtime-test");
  });

  it("/health is public (no auth required) and returns ok", async () => {
    const res = await fetch(`http://127.0.0.1:${handle.port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", transport: "http" });
  });
});

describe("startMcpServer — skipAuth bypasses bearer check", () => {
  let handle: HttpHandle;

  beforeEach(async () => {
    handle = (await startMcpServer(makeServer(), {
      transport: "http",
      port: 0,
      skipAuth: true,
    })) as HttpHandle;
  });

  afterEach(async () => {
    await handle.close();
  });

  it("accepts request with no Authorization header", async () => {
    const res = await rpc(handle, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "t", version: "0" },
      },
    });
    expect(res.status).toBe(200);
  });
});
