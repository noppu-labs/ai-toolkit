import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AgentOutput,
  cleanFixtures,
  countOccurrences,
  EXAMPLE_FIXTURES,
  EXAMPLE_PR,
  type Finding,
  HEAD_SHA,
  makeBrief,
  makePr,
  makeStage,
  type Pr,
  reviewedHeads,
  runScript,
  STAGE_KEYS,
  type StageOutput,
  sectionBetween,
  skill,
  WHOLE_SCRIPT_TIMEOUT_MS,
} from "./helpers.ts";

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
