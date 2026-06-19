/**
 * End-to-end proof that annotations produced by inferToolAnnotations actually
 * surface in a tools/list response through the MCP SDK — i.e. the
 * `server.tool(name, description, schema, annotations, handler)` overload wires
 * the hints all the way to the client. This is the contract every @us-all
 * consumer relies on when its tool() helper applies inferToolAnnotations.
 */
import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { inferToolAnnotations } from "../src/annotations.js";

async function listToolsWith(names: string[]) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  for (const name of names) {
    server.tool(
      name,
      `desc for ${name}`,
      { x: z.string().optional() },
      inferToolAnnotations(name),
      async () => ({ content: [{ type: "text", text: "ok" }] }),
    );
  }
  const client = new Client({ name: "c", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  const { tools } = await client.listTools();
  const byName = new Map(tools.map((t) => [t.name, t]));
  return byName;
}

describe("annotations surface in tools/list via the SDK", () => {
  it("propagates readOnly / destructive / openWorld hints to the client", async () => {
    const tools = await listToolsWith([
      "list-monitors",
      "delete-monitor",
      "mute-monitor",
    ]);

    expect(tools.get("list-monitors")?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: true,
    });

    expect(tools.get("delete-monitor")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });

    const mute = tools.get("mute-monitor")?.annotations;
    expect(mute?.readOnlyHint).toBe(false);
    expect(mute?.destructiveHint).toBeUndefined();
  });
});
