import { describe, expect, it } from "vitest";
import {
  BASE_SHA,
  cleanFixtures,
  HEAD_SHA,
  makePr,
  type Pr,
  reviewedHeads,
  runScript,
  sectionOf,
} from "./helpers.ts";

describe("args", () => {
  it.each([
    [undefined, /non-empty array/],
    [[], /non-empty array/],
    [{ number: 7 }, /non-empty array/],
    [[7], /args\[0\] must be an object/],
    [
      [{ ...makePr(), number: "7" }],
      /args\[0\]\.number must be a positive integer/,
    ],
    [
      [makePr(), { ...makePr(), url: " " }],
      /args\[1\]\.url must be a non-empty string/,
    ],
    [
      [{ ...makePr(), headSha: undefined }],
      /args\[0\]\.headSha must be the full 40-character SHA/,
    ],
    [
      [{ ...makePr(), headSha: "pr-review/117" }],
      /args\[0\]\.headSha must be the full 40-character SHA/,
    ],
    [
      [makePr(), { ...makePr({ number: 118 }), headSha: HEAD_SHA.slice(0, 7) }],
      /args\[1\]\.headSha must be the full 40-character SHA/,
    ],
    [
      [{ ...makePr(), headSha: HEAD_SHA.toUpperCase() }],
      /args\[0\]\.headSha must be the full 40-character SHA/,
    ],
    [
      [{ ...makePr(), headSha: 59_867 }],
      /args\[0\]\.headSha must be the full 40-character SHA/,
    ],
    [
      [{ ...makePr(), checkout: "" }],
      /args\[0\]\.checkout must be an absolute path/,
    ],
    [
      [{ ...makePr(), checkout: "relative/dir" }],
      /args\[0\]\.checkout must be an absolute path/,
    ],
    [
      [{ ...makePr(), checkout: 7 }],
      /args\[0\]\.checkout must be an absolute path/,
    ],
    [
      [{ ...makePr(), setup: "worktree" }],
      /args\[0\]\.setup must be an object with kind and note/,
    ],
    [
      [{ ...makePr(), setup: null }],
      /args\[0\]\.setup must be an object with kind and note/,
    ],
    [
      [{ ...makePr(), setup: { kind: "none", note: "x", extra: 1 } }],
      /args\[0\]\.setup\.extra is not a known key/,
    ],
    [
      [{ ...makePr(), setup: { kind: "tree", note: "x" } }],
      /args\[0\]\.setup\.kind must be one of checkout, worktree, clone, none/,
    ],
    [
      [{ ...makePr(), setup: { note: "x" } }],
      /args\[0\]\.setup\.kind must be one of/,
    ],
    [
      [{ ...makePr(), setup: { kind: "none", note: " " } }],
      /args\[0\]\.setup\.note must be a non-empty string/,
    ],
    [
      [{ ...makePr(), setup: { kind: "none" } }],
      /args\[0\]\.setup\.note must be a non-empty string/,
    ],
    [
      [
        {
          ...makePr(),
          checkout: "/tmp/pr-review-117",
          setup: { kind: "checkout", note: "x" },
        },
      ],
      /args\[0\]\.setup\.kind must be worktree or clone when checkout is set/,
    ],
    [
      [
        {
          ...makePr(),
          checkout: "/tmp/pr-review-117",
          setup: { kind: "clone", note: "x" },
        },
      ],
      /args\[0\]\.base must be a full 40-character SHA when setup\.kind is clone/,
    ],
    [
      [
        {
          ...makePr({ base: "a".repeat(39) }),
          checkout: "/tmp/pr-review-117",
          setup: { kind: "clone", note: "x" },
        },
      ],
      /args\[0\]\.base must be a full 40-character SHA/,
    ],
    [
      [{ ...makePr(), instructions: "be strict" }],
      /args\[0\]\.instructions must be an object/,
    ],
    [
      [{ ...makePr(), instructions: null }],
      /args\[0\]\.instructions must be an object/,
    ],
    [
      [{ ...makePr(), instructions: ["be strict"] }],
      /args\[0\]\.instructions must be an object/,
    ],
    [
      [{ ...makePr(), instructions: { security: "check auth" } }],
      /args\[0\]\.instructions\.security is not a known key/,
    ],
    [
      [{ ...makePr(), instructions: { correctness: 7 } }],
      /args\[0\]\.instructions\.correctness must be a non-empty string/,
    ],
    [
      [makePr(), { ...makePr({ number: 118 }), instructions: { all: " " } }],
      /args\[1\]\.instructions\.all must be a non-empty string/,
    ],
  ])("rejects %j before any agent runs", async (args, message) => {
    await expect(runScript(args, {})).rejects.toThrow(message);
  });
});

// The skill builds `args` from these examples, so each must pass the script's
// validation once `<HEAD_SHA>` holds a SHA: a key the script requires and the
// example leaves out costs every workflow-path run one rejected call.
function argsExamples(): unknown[][] {
  const section = sectionOf(
    "### Workflow path",
    "### Correctness, first pass: `code-review`",
  );
  const blocks = [...section.matchAll(/```json\n([\s\S]*?)\n```/g)].map(
    (match) => match[1] ?? "",
  );

  return blocks.map((block) => {
    const parsed: unknown = JSON.parse(
      block
        .replaceAll("<HEAD_SHA>", HEAD_SHA)
        .replaceAll("<BASE_SHA>", BASE_SHA),
    );

    return Array.isArray(parsed) ? parsed : [parsed];
  });
}

describe("a clone's base", () => {
  it.each([
    ["clone", BASE_SHA, true],
    ["worktree", "origin/main", true],
    ["checkout", "origin/main", false],
    ["none", "origin/main", false],
  ])("accepts %s with base %s", async (kind, base, hasCheckout) => {
    const pr = makePr({
      base,
      ...(hasCheckout ? { checkout: "/tmp/pr-review-117" } : {}),
      setup: { kind, note: "x" },
    });
    const run = await runScript([pr], cleanFixtures(pr));

    expect(reviewedHeads(run.result.report)).toEqual([HEAD_SHA]);
  });
});

describe("args examples in SKILL.md", () => {
  it("has the plain example, the one with instructions, and the one with checkout", () => {
    expect(argsExamples()).toHaveLength(3);
  });

  it.each([0, 1, 2])(
    "example %i passes the script's validation",
    async (index) => {
      const args = argsExamples()[index] ?? [];
      const fixtures = Object.fromEntries(
        args.flatMap((pr) =>
          Object.entries(
            cleanFixtures({ ...makePr(), ...(pr as Partial<Pr>) }),
          ),
        ),
      );
      const run = await runScript(args, fixtures);

      expect(reviewedHeads(run.result.report)).toEqual(
        args.map(() => HEAD_SHA),
      );
    },
  );
});
