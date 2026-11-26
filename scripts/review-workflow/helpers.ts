import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import fc from "fast-check";

export type Instructions = Partial<Record<InstructionKey, string>>;

export type Pr = {
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

export type Skipped = { tool: string; reason: string };

export type Finding = { path: string; line: number; text: string };

export type BriefOutput = {
  brief: string;
  source: "investigate" | "fallback";
  skipped: Skipped[];
  checkoutHead?: string;
};

export type StageOutput = {
  findings: Finding[];
  validated: string[];
  skipped: Skipped[];
};

export type AgentOutput = BriefOutput | StageOutput | null | "throw";

export type AgentOptions = { label: string; phase: string; schema: unknown };

export type Prompt = AgentOptions & { prompt: string };

export type Counts = Record<string, number | null>;

export type RunResult = { report: string; counts: Counts[] };

export type Run = {
  result: RunResult;
  prompts: Prompt[];
  logs: string[];
  phases: string[];
};

export type Meta = {
  name: string;
  description: string;
  phases: Array<{ title: string; detail?: string }>;
};

export type Stage = (
  prev: unknown,
  item: unknown,
  index: number,
) => unknown | Promise<unknown>;

export type Thunk = () => Promise<unknown>;

export type ScriptBody = (
  agent: (prompt: string, opts: AgentOptions) => Promise<unknown>,
  pipeline: (items: unknown[], ...stages: Stage[]) => Promise<unknown[]>,
  parallel: (thunks: Thunk[]) => Promise<unknown[]>,
  phase: (title: string) => void,
  log: (message: string) => void,
  args: unknown,
  budget: unknown,
  workflow: unknown,
) => Promise<RunResult>;

export const scriptPath: string = join(
  import.meta.dirname,
  "..",
  "..",
  "review",
  "workflows",
  "pr-review-stages.js",
);

export const skillPath: string = join(
  import.meta.dirname,
  "..",
  "..",
  "review",
  "skills",
  "pr-review",
  "SKILL.md",
);

export const source: string = readFileSync(scriptPath, "utf8");
export const skill: string = readFileSync(skillPath, "utf8");

export const workflowsDir: string = join(
  import.meta.dirname,
  "..",
  "..",
  "review",
  "workflows",
);

export const WORKFLOW_SCRIPTS: string[] = readdirSync(workflowsDir)
  .filter((name) => name.endsWith(".js"))
  .sort();

export const STAGE_KEYS = ["correctness", "typeSafety", "comments"] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export type InstructionKey = StageKey | "brief" | "all";

export const STAGE_MARKERS: Record<StageKey, string> = {
  correctness: "Correctness stage, the second pass:",
  typeSafety: "Type safety stage:",
  comments: "Comments stage:",
};

export const INSTRUCTIONS_HEADING: string =
  "## Additional instructions from the caller";

export const BRIEF_TRAILER_START: string =
  "Return the brief through the structured output";

export const STAGE_TRAILER_START: string =
  "Return the three sections through the structured output";

// Every run executes the whole script through the harness, so 100 runs under
// coverage instrumentation in CI need more than vitest's default timeout.
export const WHOLE_SCRIPT_TIMEOUT_MS: number = 120_000;

export function labelsOf(pr: Pr): Array<[InstructionKey, string]> {
  return (["brief", ...STAGE_KEYS] as const).map(
    (key): [InstructionKey, string] => [key, `${key}:${pr.number}`],
  );
}

// The runtime wraps the body in an async function, which makes the top-level
// `return` legal. The test does the same with fake runtime globals, minus the
// `export` keyword on `meta`.
export const AsyncFunction = Object.getPrototypeOf(async () => {})
  .constructor as new (
  ...params: string[]
) => ScriptBody;

export function compileSource(text: string): ScriptBody {
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

export function isMeta(value: unknown): value is Meta {
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

export function readMetaOf(text: string): Meta {
  const match = /^export const meta = (\{[\s\S]*?\n\});/.exec(text);

  if (match?.[1] === undefined) {
    throw new Error("meta literal not found at the top of the script");
  }

  const parsed: unknown = runInNewContext(`(${match[1]})`);

  if (!isMeta(parsed)) {
    throw new Error("meta literal has an unexpected shape");
  }

  return parsed;
}

export function compile(): ScriptBody {
  return compileSource(source);
}

export function readMeta(): Meta {
  return readMetaOf(source);
}

export async function runItem(
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

export function prNumberOf(item: unknown): number | undefined {
  if (typeof item === "object" && item !== null && "number" in item) {
    const { number } = item as { number: unknown };

    return typeof number === "number" ? number : undefined;
  }

  return undefined;
}

// The runtime drops an item to null when one of its stages throws. `drop`
// reproduces that outcome for the listed PR numbers without needing a stage
// that throws, since the script now catches every throw it can.
export function makePipeline(
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

export function fakeParallel(thunks: Thunk[]): Promise<unknown[]> {
  return Promise.all(thunks.map((thunk) => thunk().catch(() => null)));
}

export type RunOptions = { drop?: number[] };

export async function runScript(
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

export function sectionOf(heading: string, next: string): string {
  const start = skill.indexOf(`\n${heading}\n`);
  const end = skill.indexOf(`\n${next}\n`);

  if (start < 0 || end < 0) {
    throw new Error(`SKILL.md section ${heading} not found`);
  }

  return skill.slice(start + heading.length + 2, end).trim();
}

export function fencedAfter(marker: string): string {
  const at = skill.indexOf(`\n${marker}\n`);

  if (at < 0) {
    throw new Error(`SKILL.md marker ${marker} not found`);
  }

  const open = skill.indexOf("\n```text\n", at);
  const close = skill.indexOf("\n```\n", open + 1);

  return skill.slice(open + "\n```text\n".length, close);
}

export function fill(template: string, slots: Record<string, string>): string {
  return Object.entries(slots).reduce(
    (text, [slot, value]) => text.split(`<${slot}>`).join(value),
    template,
  );
}

export function stageTemplate(key: StageKey, pr: Pr, brief: string): string {
  return fill(fencedAfter(STAGE_MARKERS[key]), {
    BRIEF: brief,
    BASE: pr.base,
    HEAD: pr.headSha,
    PR_TITLE: pr.title,
    PR_URL: pr.url,
  });
}

export function briefTemplate(pr: Pr): string {
  return fill(
    sectionOf("## Step 2: structural brief", "## Step 3: run the passes"),
    { BASE: pr.base, HEAD: pr.headSha },
  );
}

export function textsOf(instructions: Instructions): Array<[string, string]> {
  return Object.entries(instructions).flatMap(([name, text]) =>
    text === undefined ? [] : [[name, text] as [string, string]],
  );
}

export function expectedCounts(
  key: InstructionKey,
  instructions: Instructions,
): { heading: number; texts: number[] } {
  const texts = textsOf(instructions).map(([name]) =>
    name === "all" || name === key ? 1 : 0,
  );

  return { heading: texts.includes(1) ? 1 : 0, texts };
}

// biome-ignore lint/security/noSecrets: a commit SHA fixture, not a secret
export const HEAD_SHA: string = "59867ee01a72ef9bd06c524fa9650d4cdc74b9ac";
export const BASE_SHA: string = "b".repeat(40);

export function makePr(overrides: Partial<Pr> = {}): Pr {
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

export function makeStage(overrides: Partial<StageOutput> = {}): StageOutput {
  return { findings: [], validated: [], skipped: [], ...overrides };
}

export function makeBrief(overrides: Partial<BriefOutput> = {}): BriefOutput {
  return { brief: "BRIEF TEXT", source: "fallback", skipped: [], ...overrides };
}

export function cleanFixtures(pr: Pr): Record<string, AgentOutput> {
  return {
    [`brief:${pr.number}`]: makeBrief(),
    [`correctness:${pr.number}`]: makeStage(),
    [`typeSafety:${pr.number}`]: makeStage(),
    [`comments:${pr.number}`]: makeStage(),
  };
}

export function findPrompt(run: Run, label: string): Prompt {
  const prompt = run.prompts.find((entry) => entry.label === label);

  if (prompt === undefined) {
    throw new Error(`no agent call labelled ${label}`);
  }

  return prompt;
}

export function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// The pattern step 4 of SKILL.md gives a caller for finding the line.
export const REVIEWED_HEAD_LINE: RegExp = /^Reviewed head: ([0-9a-f]{40})$/gm;

export function reviewedHeads(report: string): string[] {
  return [...report.matchAll(REVIEWED_HEAD_LINE)].map(
    (match) => match[1] ?? "",
  );
}

export function sectionBetween(
  report: string,
  from: string,
  to: string,
): string {
  const start = report.indexOf(from);
  const end = report.indexOf(to, start + from.length);

  return report.slice(start, end < 0 ? undefined : end);
}

export const EXAMPLE_PR: Pr = makePr();

export const EXAMPLE_FIXTURES: Record<string, AgentOutput> = {
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

// Every value names its key, so a text that lands in the wrong prompt is
// told apart from one that belongs there.
export function makeInstructionsArb(): fc.Arbitrary<Instructions> {
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

export function readSkill(...segments: string[]): string {
  return readFileSync(
    join(import.meta.dirname, "..", "..", "review", ...segments, "SKILL.md"),
    "utf8",
  );
}

// Templates are hard-wrapped and name the head as the `<HEAD>` slot, while the
// skills write one line and `<head>`. Neither difference is drift.
export function flatten(text: string): string {
  return text.replace(/\s+/g, " ").replaceAll("<HEAD>", "<head>");
}
