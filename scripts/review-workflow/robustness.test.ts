import { describe, expect, it } from "vitest";
import {
  cleanFixtures,
  countOccurrences,
  EXAMPLE_PR,
  findPrompt,
  HEAD_SHA,
  makeBrief,
  makePr,
  makeStage,
  runScript,
} from "./helpers.ts";

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
