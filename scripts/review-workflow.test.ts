import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

type Pr = {
  number: number;
  title: string;
  base: string;
  head: string;
  url: string;
};

type Skipped = { tool: string; reason: string };

type Finding = { path: string; line: number; text: string };

type BriefOutput = {
  brief: string;
  source: "investigate" | "fallback";
  skipped: Skipped[];
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

const STAGE_KEYS: string[] = ["correctness", "typeSafety", "comments"];

const STAGE_MARKERS: Record<string, string> = {
  correctness: "Correctness stage, the second pass:",
  typeSafety: "Type safety stage:",
  comments: "Comments stage:",
};

// The runtime wraps the body in an async function, which is what makes the
// top-level `return` legal. The test does the same with the runtime globals
// replaced by fakes, so the script runs exactly as written.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...params: string[]
) => ScriptBody;

function compile(): ScriptBody {
  const body = source.replace(/^export const meta =/, "const meta =");

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

function readMeta(): Meta {
  const match = /^export const meta = (\{[\s\S]*?\n\});/.exec(source);

  if (match?.[1] === undefined) {
    throw new Error("meta literal not found at the top of the script");
  }

  return new Function(`return (${match[1]});`)() as Meta;
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

function fakePipeline(
  items: unknown[],
  ...stages: Stage[]
): Promise<unknown[]> {
  return Promise.all(items.map((item, index) => runItem(item, index, stages)));
}

function fakeParallel(thunks: Thunk[]): Promise<unknown[]> {
  return Promise.all(thunks.map((thunk) => thunk().catch(() => null)));
}

async function runScript(
  args: unknown,
  fixtures: Record<string, AgentOutput>,
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
    fakePipeline,
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

function makePr(overrides: Partial<Pr> = {}): Pr {
  return {
    number: 117,
    title: "fix(review): dash comments",
    base: "origin/main",
    head: "origin/feat/dash",
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

describe("script constraints", () => {
  it("has the meta export as its only export", () => {
    expect(source.startsWith("export const meta = {")).toBe(true);
    expect(countOccurrences(source, "\nexport ")).toBe(0);
  });

  it("uses nothing the runtime forbids", () => {
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/Date\.now\s*\(/);
    expect(source).not.toMatch(/Math\.random\s*\(/);
    expect(source).not.toMatch(/new Date\s*\(\s*\)/);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});

describe("prompts", () => {
  it("builds the brief prompt around step 2 of SKILL.md with the refs filled", async () => {
    const run = await runScript([EXAMPLE_PR], EXAMPLE_FIXTURES);
    const prompt = findPrompt(run, "brief:117");
    const step2 = fill(
      sectionOf("## Step 2: structural brief", "## Step 3: run the passes"),
      { BASE: EXAMPLE_PR.base, HEAD: EXAMPLE_PR.head },
    );

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
      const marker = STAGE_MARKERS[key];

      if (marker === undefined) {
        throw new Error(`no SKILL.md marker for ${key}`);
      }

      const expected = fill(fencedAfter(marker), {
        BRIEF: "BRIEF TEXT",
        BASE: EXAMPLE_PR.base,
        HEAD: EXAMPLE_PR.head,
        PR_TITLE: EXAMPLE_PR.title,
        PR_URL: EXAMPLE_PR.url,
      });

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
    const schema = findPrompt(run, "correctness:117").schema as {
      required: string[];
      properties: Record<string, { items?: { required?: string[] } }>;
    };

    expect(schema.required).toEqual(["findings", "validated", "skipped"]);
    expect(schema.properties.findings?.items?.required).toEqual([
      "path",
      "line",
      "text",
    ]);
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
  ])("rejects %j before any agent runs", async (args, message) => {
    await expect(runScript(args, {})).rejects.toThrow(message);
  });
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
        "# Review: 117, 118\n\n## 117 fix(review): dash comments\n",
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

  it("names a PR whose pipeline stopped instead of dropping its section", async () => {
    const { result } = await runScript([EXAMPLE_PR], {
      ...cleanFixtures(EXAMPLE_PR),
      "brief:117": "throw",
    });

    expect(result.report).toContain(
      "## 117 fix(review): dash comments\nhttps://github.com/noppu-labs/ai-toolkit/pull/117\n\nThe review of this PR did not complete",
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
  it("lists every finding exactly once, under its PR, in merge order", async () => {
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

  it("names each skipped tool once, case-insensitively", async () => {
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
