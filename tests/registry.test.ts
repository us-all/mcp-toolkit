import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry, createSearchToolsMetaTool, parseEnvList } from "../src/registry.js";

const CATEGORIES = ["core", "governance", "admin", "meta"] as const;
type Category = (typeof CATEGORIES)[number];

describe("ToolRegistry", () => {
  let r: ToolRegistry<Category>;

  beforeEach(() => {
    r = new ToolRegistry<Category>();
    r.register("list-tables", "List tables", "core");
    r.register("get-table", "Get table by id", "core");
    r.register("create-tag", "Create a new tag", "governance");
    r.register("list-bots", "List bots", "admin");
  });

  it("matches by tool name token", () => {
    expect(r.search("table").map((m) => m.name)).toContain("list-tables");
    expect(r.search("table").map((m) => m.name)).toContain("get-table");
  });

  it("respects category filter", () => {
    expect(r.search("list", "admin").map((m) => m.name)).toEqual(["list-bots"]);
  });

  it("ranks name matches higher than description", () => {
    expect(r.search("table")[0].name).toMatch(/table/);
  });

  it("summary returns correct breakdown", () => {
    const s = r.summary(CATEGORIES);
    expect(s.total).toBe(4);
    expect(s.categoryBreakdown.core).toBe(2);
  });

  it("isEnabled — default all enabled", () => {
    expect(r.isEnabled("core")).toBe(true);
    expect(r.isEnabled("admin")).toBe(true);
  });

  it("isEnabled — allowlist", () => {
    const r2 = new ToolRegistry<Category>({ enabledCategories: ["core"] });
    expect(r2.isEnabled("core")).toBe(true);
    expect(r2.isEnabled("admin")).toBe(false);
    expect(r2.isEnabled("meta")).toBe(true); // meta always enabled
  });

  it("isEnabled — denylist", () => {
    const r2 = new ToolRegistry<Category>({ disabledCategories: ["admin"] });
    expect(r2.isEnabled("core")).toBe(true);
    expect(r2.isEnabled("admin")).toBe(false);
  });
});

describe("createSearchToolsMetaTool", () => {
  it("returns schema + handler that matches registry contents", async () => {
    const r = new ToolRegistry<Category>();
    r.register("foo-bar", "Foo bar tool", "core");
    r.register("baz", "Baz tool", "admin");
    const meta = createSearchToolsMetaTool(r, CATEGORIES);
    const result = await meta.handler({ query: "foo", limit: 10 });
    expect(result.matchCount).toBe(1);
    expect(result.matches[0].name).toBe("foo-bar");
    expect(result.summary.total).toBe(2);
  });
});

describe("parseEnvList", () => {
  it("returns null for unset", () => {
    expect(parseEnvList(undefined)).toBeNull();
    expect(parseEnvList("")).toBeNull();
  });

  it("splits and lowercases", () => {
    expect(parseEnvList("Core, Governance ,  ADMIN")).toEqual(["core", "governance", "admin"]);
  });

  it("filters empty entries", () => {
    expect(parseEnvList(",,core,")).toEqual(["core"]);
  });
});
