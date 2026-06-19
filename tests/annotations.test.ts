import { describe, it, expect } from "vitest";
import { inferToolAnnotations, toolVerb } from "../src/annotations.js";

describe("toolVerb — namespace + batch stripping", () => {
  it("returns the first token for plain verb-noun names", () => {
    expect(toolVerb("list-monitors")).toBe("list");
    expect(toolVerb("create-dashboard")).toBe("create");
  });
  it("peels namespace prefixes (dbt/airflow/dq/docs/sheets/slides)", () => {
    expect(toolVerb("airflow-list-dags")).toBe("list");
    expect(toolVerb("airflow-trigger-dag")).toBe("trigger");
    expect(toolVerb("dbt-get-model")).toBe("get");
    expect(toolVerb("dq-list-checks")).toBe("list");
    expect(toolVerb("docs-insert-text")).toBe("insert");
    expect(toolVerb("sheets-get-values")).toBe("get");
    expect(toolVerb("slides-create-presentation")).toBe("create");
  });
  it("peels a batch wrapper after the namespace", () => {
    expect(toolVerb("sheets-batch-update-values")).toBe("update");
    expect(toolVerb("sheets-batch-get-values")).toBe("get");
    expect(toolVerb("docs-batch-update")).toBe("update");
  });
});

describe("inferToolAnnotations — read tools", () => {
  const reads = [
    "list-monitors", "get-dashboard", "search-logs", "query-metrics",
    "aggregate-logs", "validate-monitor", "validate-data-contract",
    "analyze-monitor-state", "incident-triage-snapshot", "dag-health-rollup",
    "quality-rollup", "slo-compliance-snapshot", "summarize-run", "compare-runs",
    "freshness-status", "firmware-inventory", "wan-uptime-trend", "top-clients-by-bandwidth",
    "semantic-search", "lineage-impact", "detect-recent-reboots",
    "dbt-coverage", "dbt-graph", "dbt-slow-models", "dq-tier-status", "dq-score-snapshot",
    "take-screenshot", "take-annotated-screenshot", "dump-ui-hierarchy", "doctor",
    "is-app-installed", "device-health", "bugreport",
  ];
  for (const name of reads) {
    it(`${name} → readOnly`, () => {
      const a = inferToolAnnotations(name);
      expect(a.readOnlyHint).toBe(true);
      expect(a.destructiveHint).toBeUndefined();
      expect(a.openWorldHint).toBe(true);
    });
  }
});

describe("inferToolAnnotations — write (non-destructive) tools", () => {
  const writes = [
    "create-monitor", "update-slo", "set-trace-tag", "add-lineage",
    "mute-monitor", "post-event", "send-dora-deployment", "trigger-synthetics",
    "run-test-suite", "run-data-contract-validation", "transition-model-version-stage",
    "finalize-logged-model", "rename-registered-model", "suggest-metadata",
    "log-metric", "log-feedback", "test-webhook", "publish-status-page",
    "airflow-trigger-dag", "docs-insert-text", "sheets-append-values",
    "slides-replace-text", "tap", "swipe", "input-text", "install-app",
    "set-display-density", "toggle-wifi", "grant-permission", "push-file",
    "pull-file", "double-tap", "long-press", "start-emulator", "open-url",
    "keep-screen-on", "port-forward",
  ];
  for (const name of writes) {
    it(`${name} → write, not read-only`, () => {
      const a = inferToolAnnotations(name);
      expect(a.readOnlyHint).toBe(false);
    });
  }
});

describe("inferToolAnnotations — destructive tools", () => {
  const destructive = [
    "delete-monitor", "delete-file", "remove-permission", "revoke-permission",
    "uninstall-app", "clear-app-data", "clear-logcat", "cancel-downtime",
    "unpublish-status-page", "sheets-delete-chart", "airflow-clear-task",
    "cancel-prompt-optimization-job",
  ];
  for (const name of destructive) {
    it(`${name} → destructive write`, () => {
      const a = inferToolAnnotations(name);
      expect(a.readOnlyHint).toBe(false);
      expect(a.destructiveHint).toBe(true);
    });
  }
});

describe("inferToolAnnotations — overrides win", () => {
  it("corrects a misclassified name field-by-field", () => {
    // sheets-find-replace: 'find' isn't a write verb, so the heuristic marks it
    // read-only; the call site overrides it.
    const a = inferToolAnnotations("sheets-find-replace", { readOnlyHint: false });
    expect(a.readOnlyHint).toBe(false);
    expect(a.openWorldHint).toBe(true); // base annotation preserved
  });
  it("can set a custom title", () => {
    const a = inferToolAnnotations("list-monitors", { title: "List Monitors" });
    expect(a.title).toBe("List Monitors");
    expect(a.readOnlyHint).toBe(true);
  });
});
