import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

type Instructions = Partial<Record<InstructionKey, string>>;

type Pr = {
  number: number;
  title: string;
  base: string;
  head: string;
  headSha: string;
  url: string;
  instructions?: Instructions;
  checkout?: string;
  setup?: { kind: string; note: string };
};

type Skipped = { tool: string; reason: string };

type Finding = { path: string; line: number; text: string };

type BriefOutput = {
  brief: string;
  source: "investigate" | "fallback";
  skipped: Skipped[];
  checkoutHead?: string;
};

type StageOutput = {
  findings: Finding[];
  validated: string[];
  skipped: Skipped[];
};

type AgentOutput = BriefOutput | StageOutput | null | "throw";

type AgentOptions = { label: string; phase: string; schema: unknown };

type Prompt = AgentOptions & { prompt: string };

type Counts = Record<string, number | null>;

type RunResult = { report: string; counts: Counts[] };

type Run = {
  result: RunResult;
  prompts: Prompt[];
  logs: string[];
  phases: string[];
};

type Meta = {
  name: string;
  description: string;
  phases: Array<{ title: string; detail?: string }>;
};

type Stage = (
  prev: unknown,
  item: unknown,
  index: number,
) => unknown | Promise<unknown>;

type Thunk = () => Promise<unknown>;

type ScriptBody = (
  agent: (prompt: string, opts: AgentOptions) => Promise<unknown>,
  pipeline: (items: unknown[], ...stages: Stage[]) => Promise<unknown[]>,
  parallel: (thunks: Thunk[]) => Promise<unknown[]>,
  phase: (title: string) => void,
  log: (message: string) => void,
  args: unknown,
  budget: unknown,
  workflow: unknown,
) => Promise<RunResult>;

const scriptPath: string = join(
  import.meta.dirname,
  "..",
  "review",
  "workflows",
  "pr-review-stages.js",
);

const skillPath: string = join(
  import.meta.dirname,
  "..",
  "review",
  "skills",
  "pr-review",
  "SKILL.md",
);

const source: string = readFileSync(scriptPath, "utf8");
const skill: string = readFileSync(skillPath, "utf8");

const workflowsDir: string = join(
  import.meta.dirname,
  "..",
  "review",
  "workflows",
);

const WORKFLOW_SCRIPTS: string[] = readdirSync(workflowsDir)
  .filter((name) => name.endsWith(".js"))
  .sort();

const STAGE_KEYS = ["correctness", "typeSafety", "comments"] as const;

type StageKey = (typeof STAGE_KEYS)[number];

type InstructionKey = StageKey | "brief" | "all";

const STAGE_MARKERS: Record<StageKey, string> = {
  correctness: "Correctness stage, the second pass:",
  typeSafety: "Type safety stage:",
  comments: "Comments stage:",
};

const INSTRUCTIONS_HEADING: string =
  "## Additional instructions from the caller";

const BRIEF_TRAILER_START: string =
  "Return the brief through the structured output";

const STAGE_TRAILER_START: string =
  "Return the three sections through the structured output";

// Every run executes the whole script through the harness, so 100 runs under
// coverage instrumentation in CI need more than vitest's default timeout.
const WHOLE_SCRIPT_TIMEOUT_MS: number = 120_000;

function labelsOf(pr: Pr): Array<[InstructionKey, string]> {
  return (["brief", ...STAGE_KEYS] as const).map(
    (key): [InstructionKey, string] => [key, `${key}:${pr.number}`],
  );
}

// The runtime wraps the body in an async function, which makes the top-level
// `return` legal. The test does the same with fake runtime globals, minus the
// `export` keyword on `meta`.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...params: string[]
) => ScriptBody;

function compileSource(text: string): ScriptBody {
  const body = text.replace(/^export const meta =/, "const meta =");

  return new AsyncFunction(
    "agent",
    "pipeline",
    "parallel",
    "phase",
    "log",
    "args",
    "budget",
    "workflow",
    body,
  );
}

function isMeta(value: unknown): value is Meta {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.name === "string" &&
    typeof record.description === "string" &&
    Array.isArray(record.phases)
  );
}

function readMetaOf(text: string): Meta {
  const match = /^export const meta = (\{[\s\S]*?\n\});/.exec(text);

  if (match?.[1] === undefined) {
    throw new Error("meta literal not found at the top of the script");
  }

  const parsed: unknown = new Function(`return (${match[1]});`)();

  if (!isMeta(parsed)) {
    throw new Error("meta literal has an unexpected shape");
  }

  return parsed;
}

function compile(): ScriptBody {
  return compileSource(source);
}

function readMeta(): Meta {
  return readMetaOf(source);
}

async function runItem(
  item: unknown,
  index: number,
  stages: Stage[],
): Promise<unknown> {
  let prev = item;

  for (const stage of stages) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: pipeline stages are sequential per item by contract
      prev = await stage(prev, item, index);
    } catch {
      return null;
    }
  }

  return prev;
}

function prNumberOf(item: unknown): number | undefined {
  if (typeof item === "object" && item !== null && "number" in item) {
    const { number } = item as { number: unknown };

    return typeof number === "number" ? number : undefined;
  }

  return undefined;
}

// The runtime drops an item to null when one of its stages throws. `drop`
// reproduces that outcome for the listed PR numbers without needing a stage
// that throws, since the script now catches every throw it can.
function makePipeline(
  drop: number[],
): (items: unknown[], ...stages: Stage[]) => Promise<unknown[]> {
  return (items: unknown[], ...stages: Stage[]) =>
    Promise.all(
      items.map((item, index) => {
        const number = prNumberOf(item);

        return number !== undefined && drop.includes(number)
          ? Promise.resolve(null)
          : runItem(item, index, stages);
      }),
    );
}

function fakeParallel(thunks: Thunk[]): Promise<unknown[]> {
  return Promise.all(thunks.map((thunk) => thunk().catch(() => null)));
}

type RunOptions = { drop?: number[] };

async function runScript(
  args: unknown,
  fixtures: Record<string, AgentOutput>,
  options: RunOptions = {},
): Promise<Run> {
  const prompts: Prompt[] = [];
  const logs: string[] = [];
  const phases: string[] = [];

  const agent = (prompt: string, opts: AgentOptions): Promise<unknown> => {
    prompts.push({ ...opts, prompt });
    const output = fixtures[opts.label];

    if (output === "throw") {
      return Promise.reject(new Error(`agent ${opts.label} failed`));
    }

    return Promise.resolve(output ?? null);
  };

  const result = await compile()(
    agent,
    makePipeline(options.drop ?? []),
    fakeParallel,
    (title) => phases.push(title),
    (message) => logs.push(message),
    args,
    { total: null },
    () => Promise.resolve(null),
  );

  return { result, prompts, logs, phases };
}

function sectionOf(heading: string, next: string): string {
  const start = skill.indexOf(`\n${heading}\n`);
  const end = skill.indexOf(`\n${next}\n`);

  if (start < 0 || end < 0) {
    throw new Error(`SKILL.md section ${heading} not found`);
  }

  return skill.slice(start + heading.length + 2, end).trim();
}

function fencedAfter(marker: string): string {
  const at = skill.indexOf(`\n${marker}\n`);

  if (at < 0) {
    throw new Error(`SKILL.md marker ${marker} not found`);
  }

  const open = skill.indexOf("\n```text\n", at);
  const close = skill.indexOf("\n```\n", open + 1);

  return skill.slice(open + "\n```text\n".length, close);
}

function fill(template: string, slots: Record<string, string>): string {
  return Object.entries(slots).reduce(
    (text, [slot, value]) => text.split(`<${slot}>`).join(value),
    template,
  );
}

function stageTemplate(key: StageKey, pr: Pr, brief: string): string {
  return fill(fencedAfter(STAGE_MARKERS[key]), {
    BRIEF: brief,
    BASE: pr.base,
    HEAD: pr.headSha,
    PR_TITLE: pr.title,
    PR_URL: pr.url,
  });
}

function briefTemplate(pr: Pr): string {
  return fill(
    sectionOf("## Step 2: structural brief", "## Step 3: run the passes"),
    { BASE: pr.base, HEAD: pr.headSha },
  );
}

function textsOf(instructions: Instructions): Array<[string, string]> {
  return Object.entries(instructions).flatMap(([name, text]) =>
    text === undefined ? [] : [[name, text] as [string, string]],
  );
}

function expectedCounts(
  key: InstructionKey,
  instructions: Instructions,
): { heading: number; texts: number[] } {
  const texts = textsOf(instructions).map(([name]) =>
    name === "all" || name === key ? 1 : 0,
  );

  return { heading: texts.includes(1) ? 1 : 0, texts };
}

// biome-ignore lint/security/noSecrets: a commit SHA fixture, not a secret
const HEAD_SHA: string = "59867ee01a72ef9bd06c524fa9650d4cdc74b9ac";
const BASE_SHA: string = "b".repeat(40);

function makePr(overrides: Partial<Pr> = {}): Pr {
  return {
    number: 117,
    title: "fix(review): dash comments",
    base: "origin/main",
    head: "pr-review/117",
    headSha: HEAD_SHA,
    url: "https://github.com/noppu-labs/ai-toolkit/pull/117",
    ...overrides,
  };
}

function makeStage(overrides: Partial<StageOutput> = {}): StageOutput {
  return { findings: [], validated: [], skipped: [], ...overrides };
}

function makeBrief(overrides: Partial<BriefOutput> = {}): BriefOutput {
  return { brief: "BRIEF TEXT", source: "fallback", skipped: [], ...overrides };
}

function cleanFixtures(pr: Pr): Record<string, AgentOutput> {
  return {
    [`brief:${pr.number}`]: makeBrief(),
    [`correctness:${pr.number}`]: makeStage(),
    [`typeSafety:${pr.number}`]: makeStage(),
    [`comments:${pr.number}`]: makeStage(),
  };
}

function findPrompt(run: Run, label: string): Prompt {
  const prompt = run.prompts.find((entry) => entry.label === label);

  if (prompt === undefined) {
    throw new Error(`no agent call labelled ${label}`);
  }

  return prompt;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// The pattern step 4 of SKILL.md gives a caller for finding the line.
const REVIEWED_HEAD_LINE: RegExp = /^Reviewed head: ([0-9a-f]{40})$/gm;

function reviewedHeads(report: string): string[] {
  return [...report.matchAll(REVIEWED_HEAD_LINE)].map(
    (match) => match[1] ?? "",
  );
}

function sectionBetween(report: string, from: string, to: string): string {
  const start = report.indexOf(from);
  const end = report.indexOf(to, start + from.length);

  return report.slice(start, end < 0 ? undefined : end);
}

const EXAMPLE_PR: Pr = makePr();

const EXAMPLE_FIXTURES: Record<string, AgentOutput> = {
  "brief:117": makeBrief({
    source: "fallback",
    skipped: [{ tool: "investigate", reason: "not listed" }],
  }),
  "correctness:117": makeStage({
    findings: [
      { path: "a.php", line: 10, text: "Null deref. Outcome: crash." },
      { path: "b.php", line: 5, text: "Docblock claims X. Outcome: harmless." },
      { path: "b.php", line: 5, text: "Docblock claims X. Outcome: harmless." },
    ],
    validated: ["npm test: pass"],
    skipped: [{ tool: "phpstan", reason: "not installed" }],
  }),
  "typeSafety:117": makeStage({
    findings: [{ path: "a.php", line: 10, text: "PHP-1 mixed. Proposed: int" }],
    skipped: [{ tool: "PHPStan", reason: "no binary on PATH" }],
  }),
  "comments:117": makeStage({
    findings: [
      { path: "b.php", line: 5, text: "WRONG: it returns false" },
      { path: "c.md", line: 1, text: "TRIM" },
    ],
  }),
};

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

type Baseline = { prompts: Prompt[]; report: string; counts: Counts[] };

function isBaseline(value: unknown): value is Baseline {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    Array.isArray(record.prompts) &&
    typeof record.report === "string" &&
    Array.isArray(record.counts)
  );
}

// What origin/main's script produced for EXAMPLE_PR and EXAMPLE_FIXTURES, kept
// as a file so the comparison does not read this branch's own templates.
function readBaseline(): Baseline {
  const parsed: unknown = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "fixtures", "pr-review-workflow-main.json"),
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

describe("report", () => {
  it("follows the step 4 skeleton, one section per PR in merge order", async () => {
    const second = makePr({ number: 118, title: "feat: second", url: "u118" });
    const run = await runScript([EXAMPLE_PR, second], {
      ...EXAMPLE_FIXTURES,
      ...cleanFixtures(second),
    });
    const { report } = run.result;

    expect(
      report.startsWith(
        `# Review: 117, 118\n\n## 117 fix(review): dash comments\n${EXAMPLE_PR.url}\n\nReviewed head: ${HEAD_SHA}\n\n### Correctness\n`,
      ),
    ).toBe(true);
    expect(report.indexOf("## 117 ")).toBeLessThan(report.indexOf("## 118 "));
    expect(countOccurrences(report, "\n### Correctness\n")).toBe(2);
    expect(countOccurrences(report, "\n### Type safety\n")).toBe(2);
    expect(countOccurrences(report, "\n### Comments\n")).toBe(2);
    expect(countOccurrences(report, "\n## Not available in this run\n")).toBe(
      1,
    );
    expect(report.endsWith("\n")).toBe(true);
  });

  it("prints each PR's reviewed head under its url, where step 4's skeleton puts it", async () => {
    // biome-ignore lint/security/noSecrets: a commit SHA fixture, not a secret
    const secondSha = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c";
    const second = makePr({
      number: 118,
      title: "feat: second",
      head: secondSha,
      headSha: secondSha,
      url: "u118",
    });
    const { result } = await runScript([EXAMPLE_PR, second], {
      ...EXAMPLE_FIXTURES,
      ...cleanFixtures(second),
    });

    expect(skill).toContain(
      "## <number> <title>\n<url>\n\nReviewed head: <HEAD_SHA>\n\n### Correctness\n",
    );
    expect(reviewedHeads(result.report)).toEqual([HEAD_SHA, secondSha]);
    expect(
      sectionBetween(result.report, "## 118 ", "## Not available"),
    ).toContain(`u118\n\nReviewed head: ${secondSha}\n\n### Correctness\n`);
  });

  it("keeps every finding under its stage with its anchor, label, and cross-references", async () => {
    const { result } = await runScript([EXAMPLE_PR], EXAMPLE_FIXTURES);
    const correctness = sectionBetween(
      result.report,
      "### Correctness",
      "### Type safety",
    );
    const typeSafety = sectionBetween(
      result.report,
      "### Type safety",
      "### Comments",
    );
    const comments = sectionBetween(
      result.report,
      "### Comments",
      "## Not available",
    );

    expect(correctness).toContain(
      "- `a.php:10` Null deref. Outcome: crash. (hand review only; also reported by type safety)",
    );
    expect(countOccurrences(correctness, "`b.php:5`")).toBe(1);
    expect(typeSafety).toContain(
      "- `a.php:10` PHP-1 mixed. Proposed: int (also reported by correctness)",
    );
    expect(comments).toContain(
      "- `b.php:5` WRONG: it returns false (also reported by correctness)",
    );
    expect(comments).toContain("- `c.md:1` TRIM\n");
    expect(result.counts).toEqual([
      { number: 117, correctness: 2, typeSafety: 1, comments: 2 },
    ]);
  });

  it("writes a heading and one line for an empty stage and for a stage that did not report", async () => {
    const { result } = await runScript([EXAMPLE_PR], {
      ...cleanFixtures(EXAMPLE_PR),
      "typeSafety:117": null,
    });

    expect(result.report).toContain("### Correctness\nNo findings.\n");
    expect(result.report).toContain(
      "### Type safety\nThe stage did not report.\n",
    );
    expect(result.report).toContain(
      "- type safety stage for PR 117: no report returned",
    );
    expect(result.counts).toEqual([
      { number: 117, correctness: 0, typeSafety: null, comments: 0 },
    ]);
  });

  it("rolls up every skipped tool once with the stages that wanted it", async () => {
    const { result } = await runScript([EXAMPLE_PR], EXAMPLE_FIXTURES);
    const rollUp = sectionBetween(
      result.report,
      "## Not available in this run",
      "\n\n",
    );

    expect(rollUp).toContain(
      "- `investigate`: wanted by structural brief (PR 117). not listed",
    );
    expect(rollUp).toContain(
      "- `phpstan`: wanted by correctness (PR 117), type safety (PR 117). not installed; no binary on PATH",
    );
    expect(countOccurrences(rollUp.toLowerCase(), "phpstan")).toBe(1);
  });

  it("says so in one line when every stage had everything", async () => {
    const { result } = await runScript([EXAMPLE_PR], cleanFixtures(EXAMPLE_PR));

    expect(result.report).toContain(
      "## Not available in this run\nEvery stage had everything it needed.\n",
    );
  });

  it("keeps the stage headings for a PR whose pipeline stopped", async () => {
    const { result } = await runScript(
      [EXAMPLE_PR],
      cleanFixtures(EXAMPLE_PR),
      { drop: [117] },
    );

    expect(result.report).toContain(
      `## 117 fix(review): dash comments\nhttps://github.com/noppu-labs/ai-toolkit/pull/117\n\nReviewed head: ${HEAD_SHA}\n\n### Correctness\nThe stage did not report.\n\n### Type safety\nThe stage did not report.\n\n### Comments\nThe stage did not report.\n\n## Not available in this run\n`,
    );
    expect(result.report).toContain(
      "- PR 117: the pipeline stopped before consolidation",
    );
    expect(result.counts).toEqual([
      { number: 117, correctness: null, typeSafety: null, comments: null },
    ]);
  });
});

function makeFindingArb(): fc.Arbitrary<Finding> {
  return fc.record({
    path: fc.stringMatching(/^[a-z]{1,6}\.php$/),
    line: fc.integer({ min: 1, max: 40 }),
    text: fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,22}[A-Za-z]$/),
  });
}

function makeStageArb(): fc.Arbitrary<StageOutput> {
  return fc.record({
    findings: fc.uniqueArray(makeFindingArb(), {
      maxLength: 6,
      selector: (finding: Finding): string =>
        `${finding.path}:${finding.line}\n${finding.text}`,
    }),
    validated: fc.constant([]),
    skipped: fc.array(
      fc.record({
        tool: fc.stringMatching(/^[a-z]{1,8}$/),
        reason: fc.stringMatching(/^[a-z ]{1,12}$/),
      }),
      { maxLength: 3 },
    ),
  });
}

// Every value names its key, so a text that lands in the wrong prompt is
// told apart from one that belongs there.
function makeInstructionsArb(): fc.Arbitrary<Instructions> {
  const valueFor = (key: InstructionKey): fc.Arbitrary<string> =>
    fc
      .stringMatching(/^[a-z]{1,8}( [a-z]{1,8}){0,3}$/)
      .map((words) => `CALLER ${key}: ${words}`);

  return fc.record(
    {
      brief: valueFor("brief"),
      correctness: valueFor("correctness"),
      typeSafety: valueFor("typeSafety"),
      comments: valueFor("comments"),
      all: valueFor("all"),
    },
    { requiredKeys: [] },
  );
}

function makePrsArb(): fc.Arbitrary<Pr[]> {
  return fc
    .uniqueArray(fc.integer({ min: 1, max: 999 }), {
      minLength: 1,
      maxLength: 3,
    })
    .map((numbers) =>
      numbers.map((number) =>
        makePr({
          number,
          title: `PR ${number}`,
          url: `https://example.test/${number}`,
        }),
      ),
    );
}

type Case = { prs: Pr[]; stages: StageOutput[][] };

function makeCaseArb(): fc.Arbitrary<Case> {
  return makePrsArb().chain((prs) =>
    fc
      .array(fc.tuple(makeStageArb(), makeStageArb(), makeStageArb()), {
        minLength: prs.length,
        maxLength: prs.length,
      })
      .map((stages) => ({ prs, stages: stages.map((tuple) => [...tuple]) })),
  );
}

function fixturesFor({ prs, stages }: Case): Record<string, AgentOutput> {
  const fixtures: Record<string, AgentOutput> = {};

  prs.forEach((pr, index) => {
    fixtures[`brief:${pr.number}`] = makeBrief();
    STAGE_KEYS.forEach((key, stageIndex) => {
      fixtures[`${key}:${pr.number}`] =
        stages[index]?.[stageIndex] ?? makeStage();
    });
  });

  return fixtures;
}

// One number per finding: how many times its line appears in the section,
// with or without a trailing label.
function findingCounts(section: string, stages: StageOutput[]): number[] {
  return stages.flatMap((stage) =>
    stage.findings.map((finding) => {
      const line = `- \`${finding.path}:${finding.line}\` ${finding.text}`;

      return (
        countOccurrences(section, `${line}\n`) +
        countOccurrences(section, `${line} (`)
      );
    }),
  );
}

describe("report properties", () => {
  it("lists every finding exactly once, under its PR, in merge order", {
    timeout: WHOLE_SCRIPT_TIMEOUT_MS,
  }, async () => {
    await fc.assert(
      fc.asyncProperty(makeCaseArb(), async (testCase) => {
        const { result } = await runScript(testCase.prs, fixturesFor(testCase));
        const { report } = result;
        const headings = testCase.prs.map((pr) =>
          report.indexOf(`\n## ${pr.number} `),
        );

        expect([...headings].sort((a, b) => a - b)).toEqual(headings);
        expect(headings.every((at) => at > 0)).toBe(true);

        headings.forEach((start, index) => {
          const next =
            headings[index + 1] ?? report.indexOf("\n## Not available");

          const counts = findingCounts(
            report.slice(start, next),
            testCase.stages[index] ?? [],
          );

          expect(counts.every((count) => count === 1)).toBe(true);
        });
      }),
    );
  });

  it("prints one reviewed head per PR, in merge order, reported or not", {
    timeout: WHOLE_SCRIPT_TIMEOUT_MS,
  }, async () => {
    await fc.assert(
      fc.asyncProperty(
        makeCaseArb(),
        fc.array(fc.stringMatching(/^[0-9a-f]{40}$/), {
          minLength: 3,
          maxLength: 3,
        }),
        fc.boolean(),
        async (testCase, shas, dropFirst) => {
          const prs = testCase.prs.map((pr, index) => ({
            ...pr,
            headSha: shas[index] ?? HEAD_SHA,
          }));
          const drop = dropFirst ? prs.slice(0, 1).map((pr) => pr.number) : [];
          const { result } = await runScript(
            prs,
            fixturesFor({ ...testCase, prs }),
            { drop },
          );

          expect(reviewedHeads(result.report)).toEqual(
            prs.map((pr) => pr.headSha),
          );
        },
      ),
    );
  });

  it("names each skipped tool once, case-insensitively", {
    timeout: WHOLE_SCRIPT_TIMEOUT_MS,
  }, async () => {
    await fc.assert(
      fc.asyncProperty(makeCaseArb(), async (testCase) => {
        const { result } = await runScript(testCase.prs, fixturesFor(testCase));
        const rollUp = result.report.slice(
          result.report.indexOf("## Not available in this run"),
        );
        const tools = new Set(
          testCase.stages
            .flat()
            .flatMap((stage) =>
              stage.skipped.map((skip) => skip.tool.toLowerCase()),
            ),
        );

        for (const tool of tools) {
          expect(countOccurrences(rollUp, `- \`${tool}\`: wanted by `)).toBe(1);
        }

        if (tools.size === 0) {
          expect(rollUp).toBe(
            "## Not available in this run\nEvery stage had everything it needed.\n",
          );
        }
      }),
    );
  });
});

describe("odd inputs", () => {
  it.each([
    [[makePr(), makePr({ title: "again" })], /lists PR 117 twice/],
    [
      '[{"number":117}]',
      /arrived as a string; pass the PR list as a JSON array value/,
    ],
  ])("rejects %j with a message that names the fix", async (args, message) => {
    await expect(runScript(args, {})).rejects.toThrow(message);
  });

  it("keeps a multi-line finding one list item by indenting its continuation lines", async () => {
    const shape =
      "PHP-2 array. Proposed shape:\n```php\nfinal class Dto {}\n```\n";
    const { result } = await runScript([EXAMPLE_PR], {
      ...cleanFixtures(EXAMPLE_PR),
      "correctness:117": makeStage({
        findings: [{ path: "a.php", line: 3, text: shape }],
      }),
      "typeSafety:117": makeStage({
        findings: [{ path: "a.php", line: 3, text: shape }],
      }),
    });

    expect(result.report).toContain(
      "- `a.php:3` PHP-2 array. Proposed shape:\n  ```php\n  final class Dto {}\n  ```\n  (hand review only; also reported by type safety)\n\n### Type safety",
    );
    expect(result.report).toContain(
      "- `a.php:3` PHP-2 array. Proposed shape:\n  ```php\n  final class Dto {}\n  ```\n  (also reported by correctness)\n\n### Comments",
    );
  });

  it("lists a skipped entry with a blank tool name as an unnamed tool", async () => {
    const { result } = await runScript([EXAMPLE_PR], {
      ...cleanFixtures(EXAMPLE_PR),
      "comments:117": makeStage({
        skipped: [{ tool: "  ", reason: "no name given" }],
      }),
    });

    expect(result.report).toContain(
      "- `unnamed tool`: wanted by comments (PR 117). no name given",
    );
  });

  it("carries a title with quotes and backticks into the prompts and the heading unchanged", async () => {
    const pr = makePr({ title: 'fix: handle `null` in "quoted" paths' });
    const run = await runScript([pr], cleanFixtures(pr));

    expect(run.result.report).toContain(
      '## 117 fix: handle `null` in "quoted" paths\n',
    );
    expect(findPrompt(run, "correctness:117").prompt).toContain(
      'Review PR "fix: handle `null` in "quoted" paths" (https://github.com/noppu-labs/ai-toolkit/pull/117) for correctness.',
    );
  });
});

describe("robustness", () => {
  it("survives a brief agent that throws and runs the stages without a brief", async () => {
    const run = await runScript([EXAMPLE_PR], {
      ...cleanFixtures(EXAMPLE_PR),
      "brief:117": "throw",
    });

    expect(findPrompt(run, "comments:117").prompt).toContain(
      "Structural brief:\n\n\n",
    );
    expect(run.result.report).toContain(
      "- structural brief for PR 117: the brief subagent returned nothing",
    );
    expect(run.result.counts).toEqual([
      { number: 117, correctness: 0, typeSafety: 0, comments: 0 },
    ]);
    expect(run.logs.some((line) => line.includes("brief agent failed"))).toBe(
      true,
    );
  });

  it("records a blank brief as missing but keeps what it skipped", async () => {
    const { result } = await runScript([EXAMPLE_PR], {
      ...cleanFixtures(EXAMPLE_PR),
      "brief:117": makeBrief({
        brief: "   ",
        skipped: [{ tool: "investigate", reason: "not listed" }],
      }),
    });

    expect(result.report).toContain(
      "- structural brief for PR 117: the brief subagent returned nothing",
    );
    expect(result.report).toContain(
      "- `investigate`: wanted by structural brief (PR 117). not listed",
    );
  });

  it("leaves slot tokens inside the brief and the title alone", async () => {
    const pr = makePr({ title: "fix: <HEAD> in titles" });
    const run = await runScript([pr], {
      ...cleanFixtures(pr),
      "brief:117": makeBrief({
        brief: "see git diff <BASE>...<HEAD> and <PR_URL>",
      }),
    });
    const prompt = findPrompt(run, "correctness:117").prompt;

    expect(prompt).toContain(
      "Structural brief:\nsee git diff <BASE>...<HEAD> and <PR_URL>\n",
    );
    expect(prompt).toContain('Review PR "fix: <HEAD> in titles" (');
    expect(prompt).toContain(`Base ref origin/main, head ref ${HEAD_SHA}.`);
  });

  it("strips a leading anchor from the text, and only the exact anchor", async () => {
    const { result } = await runScript([EXAMPLE_PR], {
      ...cleanFixtures(EXAMPLE_PR),
      "correctness:117": makeStage({
        findings: [
          {
            path: "a.php",
            line: 10,
            text: "a.php:10 Null deref. Outcome: crash.",
          },
          {
            path: "a.php",
            line: 10,
            text: "`a.php:10`, Null deref. Outcome: crash.",
          },
          {
            path: "a.php",
            line: 10,
            text: "a.php:100 is the next line. Outcome: harmless.",
          },
          { path: "a.php", line: 10, text: "a.php:10-12 claim" },
          { path: "a.php", line: 10, text: "a.php:10:5 claim" },
        ],
      }),
    });

    expect(result.report).toContain(
      "### Correctness\n- `a.php:10` Null deref. Outcome: crash. (hand review only)\n- `a.php:10` a.php:100 is the next line. Outcome: harmless. (hand review only)\n- `a.php:10` a.php:10-12 claim (hand review only)\n- `a.php:10` a.php:10:5 claim (hand review only)\n",
    );
    expect(result.counts).toEqual([
      { number: 117, correctness: 4, typeSafety: 0, comments: 0 },
    ]);
  });

  it("treats findings that differ only in surrounding whitespace as one", async () => {
    const { result } = await runScript([EXAMPLE_PR], {
      ...cleanFixtures(EXAMPLE_PR),
      "comments:117": makeStage({
        findings: [
          { path: "a.md", line: 1, text: "TRIM x" },
          { path: "a.md", line: 1, text: "TRIM x\r\n" },
          { path: "a.md", line: 1, text: "  TRIM x  " },
        ],
      }),
    });

    expect(countOccurrences(result.report, "- `a.md:1` TRIM x")).toBe(1);
    expect(result.counts).toEqual([
      { number: 117, correctness: 0, typeSafety: 0, comments: 1 },
    ]);
  });

  it("lists each wanting stage once, drops blank reasons, and indents multi-line reasons", async () => {
    const { result } = await runScript([EXAMPLE_PR], {
      ...cleanFixtures(EXAMPLE_PR),
      "comments:117": makeStage({
        skipped: [
          { tool: "phpstan", reason: "" },
          { tool: "phpstan", reason: "no binary\non PATH" },
          { tool: "PHPStan", reason: "   " },
        ],
      }),
    });

    expect(result.report).toContain(
      "- `phpstan`: wanted by comments (PR 117). no binary\n  on PATH\n",
    );
    expect(result.report).not.toContain("comments (PR 117), comments (PR 117)");
    expect(result.report).not.toContain(". ;");
  });

  it("ends the stage trailer by placing the anchor outside text", async () => {
    const run = await runScript([EXAMPLE_PR], cleanFixtures(EXAMPLE_PR));

    expect(findPrompt(run, "typeSafety:117").prompt).toMatch(
      /`text` is the entry without its leading `path:line`\.$/,
    );
  });
});

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

function readSkill(...segments: string[]): string {
  return readFileSync(
    join(import.meta.dirname, "..", "review", ...segments, "SKILL.md"),
    "utf8",
  );
}

// Templates are hard-wrapped and name the head as the `<HEAD>` slot, while the
// skills write one line and `<head>`. Neither difference is drift.
function flatten(text: string): string {
  return text.replace(/\s+/g, " ").replaceAll("<HEAD>", "<head>");
}

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
