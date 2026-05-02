import { describe, it, expect } from "vitest";
import {
  createWrapToolHandler,
  wrapToolHandler,
  DEFAULT_REDACTION_PATTERNS,
} from "../src/wrap-tool-handler.js";

describe("wrapToolHandler — success path", () => {
  it("wraps result in MCP text content with 2-space JSON", async () => {
    const wrapped = wrapToolHandler(async () => ({ id: "1", name: "x" }));
    const out = await wrapped({});
    expect(out.isError).toBeUndefined();
    expect(out.content).toEqual([
      { type: "text", text: '{\n  "id": "1",\n  "name": "x"\n}' },
    ]);
  });

  it("auto-applies extractFields when params declare it", async () => {
    const wrapped = wrapToolHandler(async () => ({
      id: "1",
      name: "x",
      desc: "long",
    }));
    const out = await wrapped({ extractFields: "id,name" });
    expect(JSON.parse(out.content[0].text)).toEqual({ id: "1", name: "x" });
  });

  it("ignores extractFields when not a string", async () => {
    const wrapped = wrapToolHandler(async () => ({ id: "1", name: "x" }));
    const out = await wrapped({ extractFields: 42 } as Record<string, unknown>);
    expect(JSON.parse(out.content[0].text)).toEqual({ id: "1", name: "x" });
  });

  it("respects custom extractFieldsParam name", async () => {
    const wrap = createWrapToolHandler({ extractFieldsParam: "fields" });
    const wrapped = wrap(async () => ({ id: "1", name: "x", desc: "long" }));
    const out = await wrapped({ fields: "id" });
    expect(JSON.parse(out.content[0].text)).toEqual({ id: "1" });
  });
});

describe("wrapToolHandler — error fallback", () => {
  it("formats Error.message as structured JSON with isError", async () => {
    const wrapped = wrapToolHandler(async () => {
      throw new Error("boom");
    });
    const out = await wrapped({});
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content[0].text)).toEqual({ message: "boom" });
  });

  it("redacts secrets in default fallback", async () => {
    const wrapped = wrapToolHandler(async () => {
      throw new Error("auth failed: bearer abc123xyz");
    });
    const out = await wrapped({});
    expect(out.content[0].text).not.toContain("abc123xyz");
    expect(out.content[0].text).toContain("[REDACTED]");
  });

  it("redacts api_key, password, secret, authorization patterns", async () => {
    const cases = [
      "missing api_key header",
      "wrong password supplied",
      "secret rotated",
      "Authorization rejected",
      "Bearer eyJhbGciOi",
      "token expired",
    ];
    for (const msg of cases) {
      const wrapped = wrapToolHandler(async () => {
        throw new Error(msg);
      });
      const out = await wrapped({});
      expect(out.content[0].text).toContain("[REDACTED]");
    }
  });

  it("stringifies non-Error throws", async () => {
    const wrapped = wrapToolHandler(async () => {
      throw "raw string fail";
    });
    const out = await wrapped({});
    expect(JSON.parse(out.content[0].text)).toEqual({ message: "raw string fail" });
  });
});

describe("wrapToolHandler — custom redaction patterns", () => {
  it("applies caller-supplied patterns alongside defaults", async () => {
    const wrap = createWrapToolHandler({
      redactionPatterns: [/DD_API_KEY/i, /OPENMETADATA_TOKEN/i],
    });
    const wrapped = wrap(async () => {
      throw new Error("DD_API_KEY=xyz invalid");
    });
    const out = await wrapped({});
    expect(out.content[0].text).toContain("[REDACTED]");
    expect(out.content[0].text).not.toContain("DD_API_KEY");
  });
});

describe("wrapToolHandler — errorExtractors", () => {
  class WriteBlockedError extends Error {
    constructor() {
      super("Write operations are disabled. Set X_ALLOW_WRITE=true to enable.");
      this.name = "WriteBlockedError";
    }
  }

  class DomainError extends Error {
    constructor(message: string, public status: number, public body: unknown) {
      super(message);
    }
  }

  it("matches first extractor and returns passthrough text without sanitization", async () => {
    const wrap = createWrapToolHandler({
      errorExtractors: [
        {
          match: (e) => e instanceof WriteBlockedError,
          extract: (e) => ({ kind: "passthrough", text: (e as Error).message }),
        },
      ],
    });
    const wrapped = wrap(async () => {
      throw new WriteBlockedError();
    });
    const out = await wrapped({});
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toBe(
      "Write operations are disabled. Set X_ALLOW_WRITE=true to enable.",
    );
  });

  it("builds structured error with sanitization by default", async () => {
    const wrap = createWrapToolHandler({
      errorExtractors: [
        {
          match: (e) => e instanceof DomainError,
          extract: (e) => {
            const err = e as DomainError;
            return {
              kind: "structured",
              data: { message: err.message, status: err.status, details: err.body },
            };
          },
        },
      ],
    });
    const wrapped = wrap(async () => {
      throw new DomainError("auth: bearer xyz123", 401, { token: "leaked" });
    });
    const out = await wrapped({});
    const parsed = JSON.parse(out.content[0].text);
    expect(parsed.status).toBe(401);
    expect(parsed.message).toContain("[REDACTED]");
    expect(parsed.message).not.toContain("xyz123");
    expect(parsed.details).toEqual({ token: "leaked" });
  });

  it("skips sanitization when sanitize=false", async () => {
    const wrap = createWrapToolHandler({
      errorExtractors: [
        {
          match: (e) => e instanceof DomainError,
          extract: (e) => ({
            kind: "structured",
            data: { message: (e as Error).message },
            sanitize: false,
          }),
        },
      ],
    });
    const wrapped = wrap(async () => {
      throw new DomainError("bearer abc123 raw", 401, null);
    });
    const out = await wrapped({});
    expect(out.content[0].text).toContain("abc123");
    expect(out.content[0].text).not.toContain("[REDACTED]");
  });

  it("first matching extractor wins", async () => {
    const calls: string[] = [];
    const wrap = createWrapToolHandler({
      errorExtractors: [
        {
          match: (e) => {
            calls.push("first");
            return e instanceof Error;
          },
          extract: () => ({ kind: "passthrough", text: "first" }),
        },
        {
          match: () => {
            calls.push("second");
            return true;
          },
          extract: () => ({ kind: "passthrough", text: "second" }),
        },
      ],
    });
    const wrapped = wrap(async () => {
      throw new Error("anything");
    });
    const out = await wrapped({});
    expect(out.content[0].text).toBe("first");
    expect(calls).toEqual(["first"]);
  });

  it("falls through to default when no extractor matches", async () => {
    const wrap = createWrapToolHandler({
      errorExtractors: [
        {
          match: (e) => e instanceof RangeError,
          extract: () => ({ kind: "passthrough", text: "range" }),
        },
      ],
    });
    const wrapped = wrap(async () => {
      throw new TypeError("oops");
    });
    const out = await wrapped({});
    expect(JSON.parse(out.content[0].text)).toEqual({ message: "oops" });
  });
});

describe("DEFAULT_REDACTION_PATTERNS", () => {
  it("is frozen", () => {
    expect(Object.isFrozen(DEFAULT_REDACTION_PATTERNS)).toBe(true);
  });

  it("covers expected pattern surface", () => {
    const sources = DEFAULT_REDACTION_PATTERNS.map((p) => p.source);
    expect(sources).toContain("api[_-]?key");
    expect(sources).toContain("authorization");
    expect(sources).toContain("password");
    expect(sources).toContain("secret");
    expect(sources).toContain("token");
  });
});
