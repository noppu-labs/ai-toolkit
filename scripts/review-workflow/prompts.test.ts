import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BRIEF_TRAILER_START,
  briefTemplate,
  cleanFixtures,
  compileSource,
  countOccurrences,
  EXAMPLE_FIXTURES,
  EXAMPLE_PR,
  expectedCounts,
  findPrompt,
  flatten,
  INSTRUCTIONS_HEADING,
  labelsOf,
  makeInstructionsArb,
  makePr,
  readMeta,
  readMetaOf,
  readSkill,
  runScript,
  STAGE_KEYS,
  STAGE_TRAILER_START,
  skill,
  source,
  stageTemplate,
  textsOf,
  WHOLE_SCRIPT_TIMEOUT_MS,
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

describe("prompts", () => {
  it.each([
    ["the workflow script", source],
    ["pr-review SKILL.md", skill],
    [
      "the OpenCode pr-review SKILL.md",
      readSkill("opencode", "skills", "pr-review"),
    ],
  ])("names PHP-1 to PHP-6 in the type-safety stage of %s", (_name, text) => {
    expect(text).toMatch(/PHP-1\\?` to \\?`PHP-6/);
    expect(text).not.toMatch(/PHP-1\\?` to \\?`PHP-5/);
  });

  it.each([
    ["the workflow script", source],
    ["pr-review SKILL.md", skill],
    [
      "the OpenCode pr-review SKILL.md",
      readSkill("opencode", "skills", "pr-review"),
    ],
  ])(
    "asks the hand review to check names against what they do in %s",
    (_name, text) => {
      expect(flatten(text)).toContain(
        "check that its name agrees with what it does",
      );
    },
  );

  it.each([
    ["the workflow script", source],
    ["pr-review SKILL.md", skill],
    [
      "the OpenCode pr-review SKILL.md",
      readSkill("opencode", "skills", "pr-review"),
    ],
  ])(
    "relays rules the type-safety skill did not apply in %s",
    (_name, text) => {
      expect(flatten(text)).toContain(
        "and any rule it did not apply, with the reason",
      );
    },
  );

  it("builds the brief prompt around step 2 of SKILL.md with the refs filled", async () => {
    const run = await runScript([EXAMPLE_PR], EXAMPLE_FIXTURES);
    const prompt = findPrompt(run, "brief:117");
    const step2 = briefTemplate(EXAMPLE_PR);

    expect(prompt.phase).toBe("Brief");
    expect(prompt.prompt).toContain(`\n\n${step2}\n\n`);
    expect(prompt.prompt).toContain(EXAMPLE_PR.url);
    expect(prompt.prompt).not.toContain("<BASE>");
    expect(prompt.prompt).toMatch(/structured output/);
    expect(
      prompt.prompt.slice(prompt.prompt.indexOf(step2) + step2.length),
    ).toMatch(/Not available in this run[\s\S]*skipped/);
  });

  it.each(STAGE_KEYS)(
    "starts the %s stage prompt with the SKILL.md template, slots filled",
    async (key) => {
      const run = await runScript([EXAMPLE_PR], EXAMPLE_FIXTURES);
      const prompt = findPrompt(run, `${key}:117`);
      const expected = stageTemplate(key, EXAMPLE_PR, "BRIEF TEXT");

      expect(prompt.phase).toBe("Stages");
      expect(prompt.prompt.startsWith(`${expected}\n\n`)).toBe(true);
      expect(prompt.prompt).not.toMatch(/<(BRIEF|BASE|HEAD|PR_TITLE|PR_URL)>/);
      expect(prompt.prompt.slice(expected.length)).toMatch(
        /findings[\s\S]*validated[\s\S]*skipped/,
      );
    },
  );

  it("passes a schema that requires findings, validated, and skipped", async () => {
    const run = await runScript([EXAMPLE_PR], EXAMPLE_FIXTURES);
    const { schema } = findPrompt(run, "correctness:117");

    expect(schema).toMatchObject({
      required: ["findings", "validated", "skipped"],
      properties: {
        findings: { items: { required: ["path", "line", "text"] } },
      },
    });
  });

  it("runs the stages with an empty brief when the brief subagent returns nothing", async () => {
    const run = await runScript([EXAMPLE_PR], {
      ...EXAMPLE_FIXTURES,
      "brief:117": null,
    });

    expect(findPrompt(run, "comments:117").prompt).toContain(
      "Structural brief:\n\n\n",
    );
    expect(run.result.report).toContain(
      "- structural brief for PR 117: the brief subagent returned nothing",
    );
  });
});

describe("instructions", () => {
  it("appends instructions.correctness to the correctness prompt only, between the template and the trailer", async () => {
    const text =
      "The PR must deliver the three requirements in the invoking prompt.";
    const pr = makePr({ instructions: { correctness: text } });
    const run = await runScript([pr], cleanFixtures(pr));
    const prompt = findPrompt(run, "correctness:117").prompt;
    const trailer = prompt.slice(prompt.indexOf(STAGE_TRAILER_START));

    expect(prompt).toBe(
      `${stageTemplate("correctness", pr, "BRIEF TEXT")}\n\n${INSTRUCTIONS_HEADING}\n\n${text}\n\n${trailer}`,
    );
    expect(trailer).not.toContain("\n");

    for (const label of ["brief:117", "typeSafety:117", "comments:117"]) {
      expect(findPrompt(run, label).prompt).not.toContain(INSTRUCTIONS_HEADING);
      expect(findPrompt(run, label).prompt).not.toContain(text);
    }
  });

  it("sends instructions.all to the brief and every stage, and instructions.brief to the brief alone", async () => {
    const pr = makePr({
      instructions: {
        all: "Pass --repo acme/app to every gh call.",
        brief: "Only pull/117/head was fetched; origin/feat/dash is absent.",
      },
    });
    const run = await runScript([pr], cleanFixtures(pr));
    const brief = findPrompt(run, "brief:117").prompt;
    const trailer = brief.slice(brief.indexOf(BRIEF_TRAILER_START));

    expect(brief).toContain(
      `\n\n${briefTemplate(pr)}\n\n${INSTRUCTIONS_HEADING}\n\nPass --repo acme/app to every gh call.\n\nOnly pull/117/head was fetched; origin/feat/dash is absent.\n\n${trailer}`,
    );

    for (const key of STAGE_KEYS) {
      const prompt = findPrompt(run, `${key}:117`).prompt;

      expect(prompt).toContain(
        `\n\n${INSTRUCTIONS_HEADING}\n\nPass --repo acme/app to every gh call.\n\n${STAGE_TRAILER_START}`,
      );
      expect(prompt).not.toContain("pull/117/head");
    }
  });

  it("puts all before the stage's own instructions under one heading", async () => {
    const pr = makePr({
      instructions: {
        comments: "sibling=../app-api out=/tmp/audit.md",
        all: "Use pnpm.",
      },
    });
    const run = await runScript([pr], cleanFixtures(pr));
    const prompt = findPrompt(run, "comments:117").prompt;

    expect(prompt).toContain(
      `\n\n${INSTRUCTIONS_HEADING}\n\nUse pnpm.\n\nsibling=../app-api out=/tmp/audit.md\n\n${STAGE_TRAILER_START}`,
    );
    expect(countOccurrences(prompt, INSTRUCTIONS_HEADING)).toBe(1);
  });

  it("trims the instruction text", async () => {
    const pr = makePr({
      instructions: { typeSafety: "  \nStrict mode is on.\n\n" },
    });
    const run = await runScript([pr], cleanFixtures(pr));

    expect(findPrompt(run, "typeSafety:117").prompt).toContain(
      `\n\n${INSTRUCTIONS_HEADING}\n\nStrict mode is on.\n\n${STAGE_TRAILER_START}`,
    );
  });

  it("leaves the prompts byte-for-byte unchanged without instructions and with an empty object", async () => {
    const plain = makePr();
    const empty = makePr({ instructions: {} });
    const withoutRun = await runScript([plain], cleanFixtures(plain));
    const emptyRun = await runScript([empty], cleanFixtures(empty));

    expect(emptyRun.prompts).toEqual(withoutRun.prompts);

    const brief = findPrompt(withoutRun, "brief:117").prompt;
    const step2 = briefTemplate(plain);
    const afterBrief = brief.slice(brief.indexOf(step2) + step2.length);

    expect(afterBrief.startsWith(`\n\n${BRIEF_TRAILER_START}`)).toBe(true);
    expect(afterBrief.slice(2)).not.toContain("\n");

    for (const key of STAGE_KEYS) {
      const prompt = findPrompt(withoutRun, `${key}:117`).prompt;
      const template = stageTemplate(key, plain, "BRIEF TEXT");
      const rest = prompt.slice(template.length);

      expect(prompt.startsWith(template)).toBe(true);
      expect(rest.startsWith(`\n\n${STAGE_TRAILER_START}`)).toBe(true);
      expect(rest.slice(2)).not.toContain("\n");
    }

    for (const run of [withoutRun, emptyRun]) {
      for (const prompt of run.prompts) {
        expect(prompt.prompt).not.toContain(INSTRUCTIONS_HEADING);
      }
    }
  });

  it("keeps each PR's instructions out of the other PR's prompts", async () => {
    const first = makePr({ instructions: { all: "FIRST ONLY" } });
    const second = makePr({
      number: 118,
      title: "feat: second",
      url: "u118",
      instructions: { correctness: "SECOND ONLY" },
    });
    const run = await runScript([first, second], {
      ...cleanFixtures(first),
      ...cleanFixtures(second),
    });

    for (const [, label] of labelsOf(first)) {
      expect(findPrompt(run, label).prompt).toContain("FIRST ONLY");
      expect(findPrompt(run, label).prompt).not.toContain("SECOND ONLY");
    }

    for (const [key, label] of labelsOf(second)) {
      expect(findPrompt(run, label).prompt).not.toContain("FIRST ONLY");
      expect(
        countOccurrences(findPrompt(run, label).prompt, "SECOND ONLY"),
      ).toBe(key === "correctness" ? 1 : 0);
    }
  });

  it("leaves slot tokens inside instructions alone", async () => {
    const pr = makePr({
      instructions: { all: "Compare <BASE>...<HEAD> and cite <PR_URL>." },
    });
    const run = await runScript([pr], cleanFixtures(pr));

    expect(findPrompt(run, "correctness:117").prompt).toContain(
      `${INSTRUCTIONS_HEADING}\n\nCompare <BASE>...<HEAD> and cite <PR_URL>.\n\n`,
    );
  });

  it("puts each instruction in exactly the prompts its key names", {
    timeout: WHOLE_SCRIPT_TIMEOUT_MS,
  }, async () => {
    await fc.assert(
      fc.asyncProperty(makeInstructionsArb(), async (instructions) => {
        const pr = makePr({ instructions });
        const run = await runScript([pr], cleanFixtures(pr));

        for (const [key, label] of labelsOf(pr)) {
          const prompt = findPrompt(run, label).prompt;
          const expected = expectedCounts(key, instructions);

          expect(countOccurrences(prompt, INSTRUCTIONS_HEADING)).toBe(
            expected.heading,
          );
          expect(
            textsOf(instructions).map(([, text]) =>
              countOccurrences(prompt, text),
            ),
          ).toEqual(expected.texts);
        }
      }),
    );
  });
});
