import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countOccurrences,
  EXAMPLE_FIXTURES,
  EXAMPLE_PR,
  fencedAfter,
  findPrompt,
  flatten,
  HEAD_SHA,
  readSkill,
  runScript,
  STAGE_KEYS,
  STAGE_MARKERS,
  skill,
  source,
} from "./helpers.ts";

describe("PR head resolution", () => {
  it("names no head ref built from headRefName in the skill or the workflow", () => {
    expect(skill).not.toMatch(/origin\/<headRefName>/);
    expect(source).not.toMatch(/origin\/<headRefName>/);
  });

  it.each([
    ["a pull ref", "pr-review/117"],
    // biome-ignore lint/security/noSecrets: a commit SHA fixture, not a secret
    ["a bare SHA", "59867ee01a72ef9bd06c524fa9650d4cdc74b9ac"],
  ])(
    "fills <HEAD> with headSha when head is %s, in the brief's in-place check and worktree fallback",
    async (_label, head) => {
      const run = await runScript([{ ...EXAMPLE_PR, head }], EXAMPLE_FIXTURES);
      const prompt = findPrompt(run, "brief:117").prompt;

      expect(prompt).toContain(
        `\`git rev-parse HEAD\` equals \`git rev-parse ${HEAD_SHA}\``,
      );
      expect(prompt).toContain(
        `git worktree add <scratch>/pr-review-<number> ${HEAD_SHA}`,
      );
      expect(prompt).not.toContain("<HEAD>");
    },
  );

  // `refs/pr-review/<n>` is shared by every worktree of a clone, so a second
  // review of the same PR can move it while this run's agents still read it.
  it("never hands the movable head ref to the brief or a stage", async () => {
    const run = await runScript([EXAMPLE_PR], EXAMPLE_FIXTURES);

    expect(run.prompts).toHaveLength(4);

    for (const { label, prompt } of run.prompts) {
      expect(prompt, label).not.toContain(EXAMPLE_PR.head);
      expect(prompt.replace(/\s+/g, " "), label).toContain(
        `Base ref origin/main, head ref ${EXAMPLE_PR.headSha}.`,
      );
    }
  });
});

describe("head guard", () => {
  const guard: string =
    readSkill("skills", "correctness-review")
      .split("\n")
      .find((line) => line.startsWith("- Read files as they are at the head."))
      ?.slice(2) ?? "";

  it("starts from the sentence correctness-review states", () => {
    expect(guard).toBe(
      "Read files as they are at the head. When the working tree is not a clean checkout of `<head>`, read them with `git show <head>:<path>` and search them with `git grep <pattern> <head>`.",
    );
  });

  it.each(["type-safety-review", "comment-audit", "pr-comments"])(
    "is worded the same in %s",
    (name) => {
      expect(flatten(readSkill("skills", name))).toContain(guard);
    },
  );

  it.each([
    "Correctness stage, the first pass:",
    ...Object.values(STAGE_MARKERS),
  ])('is a paragraph of its own in the template under "%s"', (marker) => {
    const paragraphs = fencedAfter(marker).split("\n\n");

    expect(paragraphs.map(flatten)).toContain(guard);
  });

  it("reaches every stage prompt of the workflow with the head filled in", async () => {
    const run = await runScript([EXAMPLE_PR], EXAMPLE_FIXTURES);
    const filled = guard.replaceAll("<head>", EXAMPLE_PR.headSha);

    for (const key of STAGE_KEYS) {
      expect(
        findPrompt(run, `${key}:117`).prompt.replace(/\s+/g, " "),
      ).toContain(filled);
    }
  });

  it("is in all four templates of the OpenCode pr-review", () => {
    const override = flatten(readSkill("opencode", "skills", "pr-review"));

    expect(countOccurrences(override, guard)).toBe(4);
    expect(countOccurrences(flatten(skill), guard)).toBe(4);
  });
});

describe("correctness-review naming check", () => {
  const correctness: string = readSkill("skills", "correctness-review");

  it("excludes naming in the drop rule except a name that contradicts its signature", () => {
    expect(correctness).toMatch(
      /^ {2}- style, naming, formatting, and design preference, except a name that contradicts its signature/m,
    );
  });

  it("grades a contradicting name as a harmless Convention finding in the reading rules", () => {
    const readingRules = correctness.slice(
      correctness.indexOf("## Reading rules"),
      correctness.indexOf("## Angles"),
    );

    expect(readingRules).toMatch(/contradicts[\s\S]*harmless[\s\S]*Convention/);
  });

  it("flags a boolean name only when the method changes no state", () => {
    expect(correctness).toMatch(
      /returns a boolean, changes no state, and its name reads as a command/,
    );
    expect(correctness).toMatch(/reports whether it succeeded keeps its verb/);
  });
});

describe("type-safety-review PHP-6 wiring", () => {
  const typeSafety: string = readSkill("skills", "type-safety-review");
  const php: string = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "review",
      "skills",
      "type-safety-review",
      "references",
      "php.md",
    ),
    "utf8",
  );
  const taxonomy: string = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "review",
      "skills",
      "pr-comments",
      "references",
      "taxonomy.md",
    ),
    "utf8",
  );

  it("lists PHP-1 to PHP-6 in the rules, the counts, and the severity tiers", () => {
    expect(typeSafety).toContain("Rule ids are `PHP-1` through `PHP-6`");
    expect(typeSafety).toContain("every id from `PHP-1` to `PHP-6`");
    expect(typeSafety).toContain("6. A simplification (`PHP-6`).");
  });

  it("reports a rule it did not apply, with the reason", () => {
    expect(typeSafety).toContain("and any rule not applied, with the reason");
  });

  it("maps PHP-6 to the Simplification label", () => {
    expect(taxonomy).toMatch(/^\| `PHP-6` .*\| Simplification \|$/m);
  });

  it("gates PHP-6 on the lower of the platform and required PHP versions", () => {
    expect(php).toContain(
      "take the lower of `config.platform.php` and the lowest version `require.php` allows",
    );
  });

  it("keeps callables a framework resolves, serialises, or compares, and constant expressions", () => {
    expect(php).toMatch(/resolves through its container/);
    expect(php).toMatch(/serialised/);
    expect(php).toContain(
      "or part of a constant expression (an attribute argument, a constant, a property or parameter default)",
    );
  });

  it("keeps a closure whose return value the receiver reads and the rewrite would change", () => {
    expect(php).toContain("`Collection::each()` stops at the first `false`");
    expect(php).toContain(
      "A target that returns `void`, or a receiver that ignores the return value",
    );
  });

  it("does not propose a first-class callable as the argument of call_user_func", () => {
    expect(php).not.toContain("`call_user_func`");
  });

  it("keeps closures whose receiver is nullsafe or evaluated per call", () => {
    expect(php).toMatch(/nullsafe/);
    expect(php).toMatch(/evaluated on every call/);
  });

  it("allows static and function callables in constant expressions from PHP 8.5", () => {
    expect(php).toContain(
      "When the project's minimum is PHP 8.5 or higher, a first-class callable of a function or a static method does compile there and stays a finding",
    );
  });

  it("keeps a readonly non-nullable receiver a finding", () => {
    expect(php).toMatch(/readonly property with a non-nullable type/);
  });

  it("uses a built-in example that really receives an extra argument", () => {
    expect(php).toContain("->filter(is_numeric(...))");
    expect(php).not.toContain("->map(strtoupper(...))");
  });
});
