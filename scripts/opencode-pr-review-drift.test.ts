import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseSkillFile,
  rewriteSkillContent,
} from "../review/opencode/load-skills.ts";

const REVIEW_ROOT: string = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "review",
);

const claude: string = readFileSync(
  resolve(REVIEW_ROOT, "skills", "pr-review", "SKILL.md"),
  "utf8",
);

const override: string = readFileSync(
  resolve(REVIEW_ROOT, "opencode", "skills", "pr-review", "SKILL.md"),
  "utf8",
);

const IDS: ReadonlySet<string> = new Set([
  "comment-audit",
  "correctness-review",
  "pr-comments",
  "pr-review",
  "type-safety-review",
  "writing-comments",
]);

const OPENCODE_SECOND_PASS_NOTE: string = [
  "The orchestrator runs `correctness-review` as a separate first pass, so your",
  "findings are your own reading of the diff.",
].join("\n");

const SECOND_PASS_PARAGRAPH: RegExp =
  /Skills that run in a background subagent, `code-review` among them[^\n]*(?:\n[^\n]+)*/;

const MARKERS: readonly string[] = [
  "Correctness stage, the first pass:",
  "Correctness stage, the second pass:",
  "Type safety stage:",
  "Comments stage:",
];

function fencedAfter(source: string, marker: string): string {
  const at: number = source.indexOf(`\n${marker}\n`);

  if (at < 0) {
    throw new Error(`marker ${marker} not found`);
  }

  const open: number = source.indexOf("\n```text\n", at);
  const close: number = source.indexOf("\n```\n", open + 1);

  return source.slice(open + "\n```text\n".length, close);
}

function expectedOverrideBlock(marker: string): string {
  const block: string = fencedAfter(claude, marker);
  const prepared: string =
    marker === "Correctness stage, the second pass:"
      ? block.replace(SECOND_PASS_PARAGRAPH, OPENCODE_SECOND_PASS_NOTE)
      : block;

  return rewriteSkillContent(prepared, { packageRoot: "/pkg", ids: IDS });
}

describe("OpenCode pr-review override", () => {
  for (const marker of MARKERS) {
    it(`keeps the "${marker}" template in step with the Claude skill`, () => {
      expect(fencedAfter(override, marker)).toBe(expectedOverrideBlock(marker));
    });
  }

  it("replaces the code-review paragraph in the second pass", () => {
    expect(fencedAfter(claude, MARKERS[1] ?? "")).toMatch(
      SECOND_PASS_PARAGRAPH,
    );
    expect(fencedAfter(override, MARKERS[1] ?? "")).toContain(
      OPENCODE_SECOND_PASS_NOTE,
    );
  });

  it("names no Claude-only facility", () => {
    for (const word of [
      "Workflow",
      "code-review",
      "investigate:brief",
      "finder",
    ]) {
      expect(override).not.toContain(word);
    }
  });

  it("dispatches through the subagent tool with the general agent", () => {
    expect(override).toContain("subagent");
    expect(override).toContain('agent: "general"');
  });

  it("has frontmatter that names the skill pr-review", () => {
    expect(parseSkillFile(override).name).toBe("pr-review");
  });
});
