import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileSource,
  countOccurrences,
  EXAMPLE_FIXTURES,
  EXAMPLE_PR,
  readMeta,
  readMetaOf,
  runScript,
  WORKFLOW_SCRIPTS,
  workflowsDir,
} from "./helpers.ts";

describe("meta", () => {
  it("names the workflow differently from the pr-review skill", () => {
    const meta = readMeta();

    expect(meta.name).not.toBe("pr-review");
    expect(meta.name).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(meta.description.length).toBeGreaterThan(0);
  });

  it("lists exactly the phases the script uses, in order", async () => {
    const run = await runScript([EXAMPLE_PR], EXAMPLE_FIXTURES);
    const titles = readMeta().phases.map((phase) => phase.title);
    const used = [
      ...new Set([...run.prompts.map((prompt) => prompt.phase), ...run.phases]),
    ];

    expect(titles).toEqual(["Brief", "Stages", "Consolidate"]);
    expect(used).toEqual(titles);
  });
});

describe("every workflow script", () => {
  it("has at least the pr-review-stages script", () => {
    expect(WORKFLOW_SCRIPTS).toContain("pr-review-stages.js");
  });

  it.each(WORKFLOW_SCRIPTS)("%s compiles as a function body", (name) => {
    const text = readFileSync(join(workflowsDir, name), "utf8");

    expect(() => compileSource(text)).not.toThrow();
  });

  it.each(WORKFLOW_SCRIPTS)(
    "%s has the meta export as its only export",
    (name) => {
      const text = readFileSync(join(workflowsDir, name), "utf8");
      const meta = readMetaOf(text);

      expect(text.startsWith("export const meta = {")).toBe(true);
      expect(countOccurrences(text, "\nexport ")).toBe(0);
      expect(meta.name).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(meta.name).not.toBe("pr-review");
    },
  );

  it.each(WORKFLOW_SCRIPTS)("%s uses nothing the runtime forbids", (name) => {
    const text = readFileSync(join(workflowsDir, name), "utf8");

    expect(text).not.toMatch(/\bimport\s*\(/);
    expect(text).not.toMatch(/Date\.now\s*\(/);
    expect(text).not.toMatch(/Math\.random\s*\(/);
    expect(text).not.toMatch(/new Date\s*\(\s*\)/);
    expect(text).not.toMatch(/\brequire\s*\(/);
  });
});
