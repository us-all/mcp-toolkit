import { describe, it, expect } from "vitest";
import { aggregate, defaultFormatReason } from "../src/aggregate.js";

describe("aggregate", () => {
  it("returns all values when every fetcher resolves", async () => {
    const caveats: string[] = [];
    const result = await aggregate(
      {
        a: async () => 1,
        b: async () => "two",
        c: async () => ({ k: 3 }),
      },
      caveats,
    );
    expect(result).toEqual({ a: 1, b: "two", c: { k: 3 } });
    expect(caveats).toEqual([]);
  });

  it("returns null for rejected fetcher and pushes labeled caveat", async () => {
    const caveats: string[] = [];
    const result = await aggregate(
      {
        ok: async () => "fine",
        broken: async () => {
          throw new Error("boom");
        },
      },
      caveats,
    );
    expect(result.ok).toBe("fine");
    expect(result.broken).toBeNull();
    expect(caveats).toEqual(["broken failed: boom"]);
  });

  it("does not poison the surviving values when one fetcher fails", async () => {
    const caveats: string[] = [];
    const result = await aggregate(
      {
        first: async () => 100,
        second: async () => {
          throw new Error("nope");
        },
        third: async () => 200,
      },
      caveats,
    );
    expect(result.first).toBe(100);
    expect(result.second).toBeNull();
    expect(result.third).toBe(200);
    expect(caveats).toHaveLength(1);
  });

  it("appends to an already-populated caveats array (does not replace)", async () => {
    const caveats = ["pre-existing note"];
    await aggregate(
      {
        bad: async () => {
          throw new Error("late failure");
        },
      },
      caveats,
    );
    expect(caveats).toEqual(["pre-existing note", "bad failed: late failure"]);
  });

  it("uses a custom formatReason for structured errors", async () => {
    const caveats: string[] = [];
    await aggregate(
      {
        api: async () => {
          // simulate an API client throwing a non-Error structured value
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw { status: 503, body: "service unavailable" };
        },
      },
      caveats,
      (reason) => {
        const r = reason as { status?: number; body?: string };
        return `HTTP ${r.status}: ${r.body}`;
      },
    );
    expect(caveats).toEqual(["api failed: HTTP 503: service unavailable"]);
  });

  it("preserves insertion order from the fetchers object", async () => {
    const caveats: string[] = [];
    const result = await aggregate(
      {
        zeta: async () => {
          throw new Error("z");
        },
        alpha: async () => {
          throw new Error("a");
        },
        mu: async () => {
          throw new Error("m");
        },
      },
      caveats,
    );
    expect(Object.keys(result)).toEqual(["zeta", "alpha", "mu"]);
    expect(caveats).toEqual([
      "zeta failed: z",
      "alpha failed: a",
      "mu failed: m",
    ]);
  });

  it("runs fetchers concurrently, not serially", async () => {
    const caveats: string[] = [];
    const start = Date.now();
    await aggregate(
      {
        a: () => new Promise<number>((res) => setTimeout(() => res(1), 50)),
        b: () => new Promise<number>((res) => setTimeout(() => res(2), 50)),
        c: () => new Promise<number>((res) => setTimeout(() => res(3), 50)),
      },
      caveats,
    );
    const elapsed = Date.now() - start;
    // serial would be ~150ms; concurrent should land well under 100ms even on a slow CI
    expect(elapsed).toBeLessThan(120);
  });
});

describe("defaultFormatReason", () => {
  it("extracts message from Error", () => {
    expect(defaultFormatReason(new Error("oops"))).toBe("oops");
  });
  it("returns string reasons unchanged", () => {
    expect(defaultFormatReason("plain string")).toBe("plain string");
  });
  it("JSON-stringifies plain objects", () => {
    expect(defaultFormatReason({ code: 42 })).toBe('{"code":42}');
  });
  it("falls back to String() for unstringifiable values", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(defaultFormatReason(circular)).toBe("[object Object]");
  });
});
