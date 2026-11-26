import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  briefTemplate,
  type Counts,
  cleanFixtures,
  EXAMPLE_FIXTURES,
  EXAMPLE_PR,
  fencedAfter,
  fill,
  findPrompt,
  HEAD_SHA,
  INSTRUCTIONS_HEADING,
  makeBrief,
  makePr,
  makeStage,
  type Pr,
  type Prompt,
  runScript,
  STAGE_KEYS,
  stageTemplate,
} from "./helpers.ts";

type Baseline = { prompts: Prompt[]; report: string; counts: Counts[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPrompt(value: unknown): value is Prompt {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.phase === "string" &&
    typeof value.prompt === "string" &&
    "schema" in value
  );
}

function isCounts(value: unknown): value is Counts {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (count) => typeof count === "number" || count === null,
    )
  );
}

function isBaseline(value: unknown): value is Baseline {
  return (
    isRecord(value) &&
    Array.isArray(value.prompts) &&
    value.prompts.every(isPrompt) &&
    typeof value.report === "string" &&
    Array.isArray(value.counts) &&
    value.counts.every(isCounts)
  );
}

// What origin/main's script produced for EXAMPLE_PR and EXAMPLE_FIXTURES, kept
// as a file so the comparison does not read this branch's own templates.
function readBaseline(): Baseline {
  const parsed: unknown = JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "..",
        "fixtures",
        "pr-review-workflow-main.json",
      ),
      "utf8",
    ),
  );

  if (!isBaseline(parsed)) {
    throw new Error("the main baseline has an unexpected shape");
  }

  return parsed;
}

function filledCheckoutBlock(pr: Pr): string {
  return fill(fencedAfter("Checkout block:"), {
    CHECKOUT: pr.checkout ?? "",
    HEAD: pr.headSha,
  });
}

describe("checkout", () => {
  // Step 2 names the heading inside a sentence, so only a line of its own is the block.
  const CHECKOUT_HEADING: RegExp = /^## Checkout of the head$/m;
  const PATH: string = "/tmp/pr-review-117";

  it("appends the checkout block to the brief and every stage prompt, before instructions", async () => {
    const pr = makePr({ checkout: PATH, instructions: { all: "X" } });
    const run = await runScript([pr], cleanFixtures(pr));
    const block = filledCheckoutBlock(pr);

    expect(block).toContain(PATH);
    expect(block).toContain(HEAD_SHA);

    const expectedStart: Array<[string, string]> = [
      ["brief:117", briefTemplate(pr)],
      ...STAGE_KEYS.map((key): [string, string] => [
        `${key}:117`,
        stageTemplate(key, pr, "BRIEF TEXT"),
      ]),
    ];

    for (const [label, template] of expectedStart) {
      const prompt = findPrompt(run, label).prompt;

      expect(prompt).toContain(
        `${template}\n\n${block}\n\n${INSTRUCTIONS_HEADING}`,
      );
      expect(prompt.indexOf(block)).toBeLessThan(
        prompt.indexOf(INSTRUCTIONS_HEADING),
      );
    }
  });

  it("leaves the prompts, schemas and report of main unchanged without checkout and setup", async () => {
    const baseline = readBaseline();
    const run = await runScript([EXAMPLE_PR], EXAMPLE_FIXTURES);
    const expected = baseline.prompts;

    expect(run.prompts).toEqual(expected);
    expect(run.result.report).toBe(baseline.report);
    expect(run.result.counts).toEqual(baseline.counts);

    for (const entry of run.prompts) {
      expect(entry.prompt).not.toMatch(CHECKOUT_HEADING);
    }
  });

  it("keeps one PR's checkout out of the other PR's prompts", async () => {
    const first = makePr({ checkout: PATH });
    const second = makePr({ number: 118 });
    const run = await runScript([first, second], {
      ...cleanFixtures(first),
      ...cleanFixtures(second),
    });

    for (const entry of run.prompts) {
      const has = CHECKOUT_HEADING.test(entry.prompt);

      expect(has).toBe(entry.label.endsWith(":117"));
    }

    expect(run.logs).toContain("PR 117: working in /tmp/pr-review-117");
  });

  it("copies the checkout block from SKILL.md verbatim", async () => {
    const pr = makePr({ checkout: "C:\\work\\pr 117" });
    const run = await runScript([pr], cleanFixtures(pr));
    const block = filledCheckoutBlock(pr);

    expect(run.prompts).toHaveLength(4);

    for (const entry of run.prompts) {
      expect(entry.prompt).toContain(block);
    }
  });
});

describe("setup and checkoutHead", () => {
  const PATH: string = "/tmp/pr-review-117";
  // biome-ignore lint/security/noSecrets: a commit SHA fixture, not a secret
  const OTHER_SHA: string = "0123456789abcdef0123456789abcdef01234567";

  it("writes one roll-up line per PR from its setup", async () => {
    const first = makePr({
      checkout: PATH,
      setup: { kind: "worktree", note: "npm ci, scripts on." },
    });
    const second = makePr({
      number: 118,
      setup: { kind: "none", note: "head-setup.mjs exited 1: no node." },
    });
    const run = await runScript([first, second], {
      "brief:117": makeBrief({ checkoutHead: HEAD_SHA }),
      ...cleanFixtures(second),
      "correctness:117": makeStage(),
      "typeSafety:117": makeStage(),
      "comments:117": makeStage(),
    });

    expect(run.result.report).toContain(
      "- PR 117: head setup: worktree. npm ci, scripts on.\n",
    );
    expect(run.result.report).toContain(
      "- PR 118: head setup: none. head-setup.mjs exited 1: no node.\n",
    );
  });

  it("asks for checkoutHead, and carries it in the schema, only with checkout", async () => {
    const withCheckout = makePr({ checkout: PATH });
    const without = makePr({ number: 118 });
    const run = await runScript([withCheckout, without], {
      ...cleanFixtures(withCheckout),
      ...cleanFixtures(without),
    });
    const asked = findPrompt(run, "brief:117");
    const plain = findPrompt(run, "brief:118");

    expect(asked.prompt).toContain(
      "`git -C '/tmp/pr-review-117' rev-parse HEAD`",
    );
    expect(asked.prompt).toContain("`checkoutHead`");
    expect(asked.schema).toMatchObject({
      required: ["brief", "source", "skipped"],
      properties: { checkoutHead: { type: "string" } },
    });
    expect(plain.prompt).not.toContain("checkoutHead");
    expect(JSON.stringify(plain.schema)).not.toContain("checkoutHead");
  });

  it("adds a roll-up line naming both SHAs when checkoutHead differs", async () => {
    const pr = makePr({ checkout: PATH });
    const run = await runScript([pr], {
      ...cleanFixtures(pr),
      "brief:117": makeBrief({ checkoutHead: OTHER_SHA }),
    });

    expect(run.result.report).toContain(
      `- PR 117: the checkout ${PATH} was reported at ${OTHER_SHA}, not at the reviewed head ${HEAD_SHA}`,
    );
  });

  it("adds a roll-up line when checkoutHead is missing", async () => {
    const pr = makePr({ checkout: PATH });
    const run = await runScript([pr], cleanFixtures(pr));

    expect(run.result.report).toContain(
      `- PR 117: the checkout ${PATH} was reported at no commit, not at the reviewed head ${HEAD_SHA}`,
    );
  });

  it("adds no line when checkoutHead matches the reviewed head", async () => {
    const pr = makePr({ checkout: PATH });
    const run = await runScript([pr], {
      ...cleanFixtures(pr),
      "brief:117": makeBrief({ checkoutHead: `${HEAD_SHA}\n` }),
    });

    expect(run.result.report).not.toContain("was reported at");
  });

  it("logs nothing about checkoutHead without checkout", async () => {
    const pr = makePr({ setup: { kind: "checkout", note: "in place." } });
    const run = await runScript([pr], cleanFixtures(pr));

    expect(run.result.report).not.toContain("was reported at");
    expect(run.result.report).toContain(
      "- PR 117: head setup: checkout. in place.",
    );
  });
});
