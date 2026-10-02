import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scriptsDir = join(
  import.meta.dirname,
  "..",
  "review",
  "skills",
  "comment-audit",
  "scripts",
);

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

type RunResult = { status: number | null; stdout: string; stderr: string };

function runWithEnv(
  env: Record<string, string>,
  script: string,
  cwd: string,
  ...args: string[]
): RunResult {
  const result = spawnSync("bash", [join(scriptsDir, script), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr,
  };
}

function run(script: string, cwd: string, ...args: string[]): RunResult {
  return runWithEnv({}, script, cwd, ...args);
}

// An interpreter name that resolves to nothing, so the scripts take the same
// branch as a machine without python3 on PATH.
const NO_PYTHON: Record<string, string> = {
  REVIEW_PYTHON: "python3-not-installed",
};

function commitFiles(
  cwd: string,
  files: Record<string, string>,
  message: string,
): void {
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(cwd, path), content);
  }
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
}

// 28 lines. The helper counts 11 of them: the module docstring (2-5), the
// ''' class docstring (14), the r""" method docstring (17-20), the own-line
// comment (21), and the function docstring (26). The shebang, both `# fmt:`
// lines, and the three trailing comments are not counted. The regex alone
// counts 8: lines 1, 2, 5, 8, 10, 20, 21, and 26.
const INVOICE_PY: string = [
  "#!/usr/bin/env python3",
  '"""Invoice totals for the billing service.',
  "",
  "Kept separate from the HTTP layer.",
  '"""',
  "from typing import Any  # noqa: F401",
  "",
  "# fmt: off",
  'RATES = {"std": 0.2}',
  "# fmt: on",
  "",
  "",
  "class Invoice:",
  "    '''An invoice line set.'''",
  "",
  "    def total(self, lines: list[float]) -> float:",
  '        r"""Sum the lines.',
  "",
  "        Rounds half up.",
  '        """',
  "        # The upstream API sends cents as floats.",
  "        return round(sum(lines), 2)  # trailing note",
  "",
  "",
  "async def fetch(client: Any) -> dict:",
  '    """Fetch the raw payload."""',
  "    data = await client.get()  # type: ignore[attr-defined]",
  "    return data",
  "",
].join("\n");

const TOTALS_PY: string = "'''Totals.\n\nOne line of why.\n'''\nTOTAL = 1\n";

// Enough unchanged lines that git still pairs the two paths as a rename after
// the docstring above it shrinks.
const RENAMED_BODY: string = [
  "",
  "",
  "def first() -> int:",
  "    return 1",
  "",
  "",
  "def second() -> int:",
  "    return 2",
  "",
  "",
  "def third() -> int:",
  "    return 3",
  "",
].join("\n");

function makeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "review-scripts-"));
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "t@example.com");
  git(cwd, "config", "user.name", "t");
  mkdirSync(join(cwd, "app"));
  mkdirSync(join(cwd, "vendor"));
  writeFileSync(
    join(cwd, "app", "Thing.php"),
    "<?php\nclass Thing\n{\n    public function go(): void\n    {\n    }\n}\n",
  );
  writeFileSync(join(cwd, "README.md"), "# Thing\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "base");
  return cwd;
}

describe("count-comment-lines.sh", () => {
  it("counts only added comment lines across comment syntaxes", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    writeFileSync(
      join(cwd, "app", "Thing.php"),
      [
        "<?php",
        "/**",
        " * Why this exists.",
        " */",
        "class Thing",
        "{",
        "    // single line",
        "    # hash style",
        "    public function go(): void",
        "    {",
        "        $x = 1;",
        "    }",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "app", "View.tsx"),
      "{/* jsx comment */}\nconst a = 1;\n",
    );
    writeFileSync(
      join(cwd, "app", "schema.graphql"),
      '"""\nDescription\n"""\ntype Q { a: Int }\n',
    );
    git(cwd, "add", ".");
    git(cwd, "commit", "-q", "-m", "feature");

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    // /**, * Why, */, //, #, {/*, """, """ = 8
    expect(result.stdout).toBe("8");
  });

  it("prints 0 when nothing was added", () => {
    const cwd = makeRepo();

    const result = run("count-comment-lines.sh", cwd, "main", "main");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("0");
  });

  it("does not count a PHP 8 attribute as a comment, but still counts a real hash comment", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    writeFileSync(
      join(cwd, "app", "Feature.php"),
      [
        "<?php",
        "#[Deprecated]",
        "# real comment",
        "class Feature",
        "{",
        "}",
        "",
      ].join("\n"),
    );
    git(cwd, "add", ".");
    git(cwd, "commit", "-q", "-m", "feature");

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("1");
  });

  it("limits the count to the given directories", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    writeFileSync(join(cwd, "vendor", "lib.php"), "<?php\n// vendored\n");
    writeFileSync(
      join(cwd, "app", "Thing.php"),
      "<?php\n// mine\nclass Thing {}\n",
    );
    git(cwd, "add", ".");
    git(cwd, "commit", "-q", "-m", "feature");

    expect(
      run("count-comment-lines.sh", cwd, "main", "feature", "app").stdout,
    ).toBe("1");
    expect(run("count-comment-lines.sh", cwd, "main", "feature").stdout).toBe(
      "2",
    );
  });

  it("counts every docstring line and own-line comment in a Python file, and no directive or trailing comment", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(cwd, { "app/invoice.py": INVOICE_PY }, "feature");

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("11");
    expect(result.stderr).toBe("");
  });

  it("sums PHP and Python comment lines in one diff", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      {
        "app/Thing.php":
          "<?php\n// why\nclass Thing\n{\n    public function go(): void\n    {\n    }\n}\n",
        "app/totals.py": `# noqa: E501\n${TOTALS_PY}`,
      },
      "feature",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    // PHP "// why" is 1. Python is the four docstring lines; the noqa line is a directive.
    expect(result.stdout).toBe("5");
  });

  it("counts only the comment lines a renamed Python file adds", () => {
    const cwd = makeRepo();
    const before =
      '"""Module docstring.\n\nKept as is.\n"""\n\n\ndef go() -> None:\n    return None\n';
    commitFiles(cwd, { "app/old_name.py": before }, "python base");
    git(cwd, "checkout", "-q", "-b", "feature");
    git(cwd, "mv", "app/old_name.py", "app/new_name.py");
    commitFiles(
      cwd,
      {
        "app/new_name.py": before.replace(
          "    return None",
          "    # added\n    return None",
        ),
      },
      "rename",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("1");
  });

  it("counts a Python file that does not parse with the regex, and names it on stderr", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      {
        "app/broken.py":
          'def broken(:\n    """Doc.\n\n    More.\n    """\n# note\n',
      },
      "feature",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    // The regex sees both """ lines and "# note", not the interior line.
    expect(result.stdout).toBe("3");
    expect(result.stderr).toContain("app/broken.py");
  });

  it("counts Python with the regex, and warns once, when python3 is missing", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(cwd, { "app/invoice.py": INVOICE_PY }, "feature");

    const result = runWithEnv(
      NO_PYTHON,
      "count-comment-lines.sh",
      cwd,
      "main",
      "feature",
      "app",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("8");
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("python3-not-installed not found");
  });

  it("does not count a triple-quoted string that is not a docstring", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      {
        "app/queries.py":
          '"""Queries."""\nQUERY = """\nselect 1\n"""\n\n\ndef run() -> str:\n    x = 1\n    """Not a docstring."""\n    return QUERY\n',
      },
      "feature",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    // Only the module docstring. The regex alone would also count the closing
    // """ of QUERY and the string statement after `x = 1`.
    expect(result.stdout).toBe("1");
  });

  it("counts a Python file whose path has spaces, and one with CRLF line endings", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      {
        "app/my module.py": '"""One.\n\nTwo.\n"""\nX = 1\n',
        "app/windows.py": '"""One.\r\n\r\nTwo.\r\n"""\r\n# why\r\nX = 1\r\n',
      },
      "feature",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("9");
    expect(result.stderr).toBe("");
  });

  it("limits the Python count to the given directories", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      {
        "vendor/lib.py": '"""Vendored.\n\nNot ours.\n"""\n',
        "app/mine.py": '"""Mine."""\n',
      },
      "feature",
    );

    expect(
      run("count-comment-lines.sh", cwd, "main", "feature", "app").stdout,
    ).toBe("1");
    expect(run("count-comment-lines.sh", cwd, "main", "feature").stdout).toBe(
      "5",
    );
  });

  it("counts the same Python lines from a subdirectory as from the root", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "lib"));
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      { "lib/calc.py": '"""Calc.\n\nTwo lines.\n"""\n# why\nX = 1\n' },
      "feature",
    );

    const fromRoot = run("count-comment-lines.sh", cwd, "main", "feature");
    const fromApp = run(
      "count-comment-lines.sh",
      join(cwd, "app"),
      "main",
      "feature",
    );
    const fromAppWithDir = run(
      "count-comment-lines.sh",
      join(cwd, "app"),
      "main",
      "feature",
      "../lib",
    );

    expect(fromRoot.stdout).toBe("5");
    expect(fromApp.status).toBe(0);
    expect(fromApp.stdout).toBe(fromRoot.stdout);
    expect(fromAppWithDir.stdout).toBe(fromRoot.stdout);
  });

  it("counts a docstring line only when no code shares it", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      {
        "app/shared.py": [
          "def one():",
          '    """doc"""; return 1',
          "",
          "",
          "def two():",
          '    """Doc.',
          "",
          "    More.",
          '    """',
          "    return 2",
          "",
        ].join("\n"),
      },
      "feature",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    // The four lines of the second docstring. The first shares its line with code.
    expect(result.stdout).toBe("4");
  });

  it("counts a prose comment that starts with a capitalised directive word", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      { "app/kinds.py": '# Type: the invoice kind\nKIND = "std"\n' },
      "feature",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("1");
  });

  it("exits 2 and names the ref when a ref does not exist", () => {
    const cwd = makeRepo();

    const result = run("count-comment-lines.sh", cwd, "no-such-ref", "main");

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("no-such-ref");
  });
});

describe("verify-comments-only.sh", () => {
  it("passes when only comment and blank lines changed", () => {
    const cwd = makeRepo();
    writeFileSync(
      join(cwd, "app", "Thing.php"),
      "<?php\n// added\nclass Thing\n{\n\n    public function go(): void\n    {\n    }\n}\n",
    );
    git(cwd, "commit", "-q", "-am", "trim");

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("only comment lines changed");
  });

  it("fails and prints the offending lines when code changed", () => {
    const cwd = makeRepo();
    writeFileSync(
      join(cwd, "app", "Thing.php"),
      "<?php\n// added\nclass Thing\n{\n    public function go(): int\n    {\n        return 1;\n    }\n}\n",
    );
    git(cwd, "commit", "-q", "-am", "oops");

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("-    public function go(): void");
    expect(result.stdout).toContain("+    public function go(): int");
    expect(result.stdout).toContain("+        return 1;");
    expect(result.stdout).not.toContain("// added");
  });

  it("fails when only a PHP 8 attribute line changed", () => {
    const cwd = makeRepo();
    writeFileSync(
      join(cwd, "app", "Thing.php"),
      [
        "<?php",
        "#[Test]",
        "class Thing",
        "{",
        "    public function go(): void",
        "    {",
        "    }",
        "}",
        "",
      ].join("\n"),
    );
    git(cwd, "commit", "-q", "-am", "base attribute");
    writeFileSync(
      join(cwd, "app", "Thing.php"),
      [
        "<?php",
        "#[Test, Group('x')]",
        "class Thing",
        "{",
        "    public function go(): void",
        "    {",
        "    }",
        "}",
        "",
      ].join("\n"),
    );
    git(cwd, "commit", "-q", "-am", "widen attribute");

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("-#[Test]");
    expect(result.stdout).toContain("+#[Test, Group('x')]");
  });

  it("passes when every changed line is a comment marker of a different style", () => {
    const cwd = makeRepo();
    writeFileSync(join(cwd, "app", "Notes.txt"), "base content line\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-q", "-m", "notes base");
    writeFileSync(
      join(cwd, "app", "Notes.txt"),
      [
        "base content line",
        "# a hash comment",
        "* a star comment",
        "/* an open block comment",
        "*/ a close block comment",
        '""" a triple quote',
        "{/* a jsx comment",
        "<!-- an html open",
        "--> an html close",
        "",
      ].join("\n"),
    );
    git(cwd, "commit", "-q", "-am", "notes markers");

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("only comment lines changed");
  });

  it("ignores markdown files, where README sections are expected", () => {
    const cwd = makeRepo();
    writeFileSync(
      join(cwd, "README.md"),
      "# Thing\n\n## Why\n\nBecause of the upstream contract.\n",
    );
    git(cwd, "commit", "-q", "-am", "readme");

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD");

    expect(result.status).toBe(0);
  });

  it("passes a docstring-only trim in a Python file", () => {
    const cwd = makeRepo();
    commitFiles(cwd, { "app/invoice.py": INVOICE_PY }, "python base");
    commitFiles(
      cwd,
      {
        "app/invoice.py": [
          "#!/usr/bin/env python3",
          '"""Invoice totals for the billing service."""',
          "from typing import Any  # noqa: F401",
          "",
          "# fmt: off",
          'RATES = {"std": 0.2}',
          "# fmt: on",
          "",
          "",
          "class Invoice:",
          "    def total(self, lines: list[float]) -> float:",
          '        r"""Sum the lines, rounding half up."""',
          "        return round(sum(lines), 2)  # trailing note",
          "",
          "",
          "async def fetch(client: Any) -> dict:",
          "    data = await client.get()  # type: ignore[attr-defined]",
          "    return data",
          "",
        ].join("\n"),
      },
      "trim",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.stdout).toBe("only comment lines changed");
    expect(result.status).toBe(0);
  });

  it("fails and prints both sides when code inside a Python function changed", () => {
    const cwd = makeRepo();
    commitFiles(cwd, { "app/invoice.py": INVOICE_PY }, "python base");
    commitFiles(
      cwd,
      {
        "app/invoice.py": INVOICE_PY.replace(
          "round(sum(lines), 2)",
          "round(sum(lines), 3)",
        ),
      },
      "oops",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual([
      "-        return round(sum(lines), 2)  # trailing note",
      "+        return round(sum(lines), 3)  # trailing note",
    ]);
  });

  it("fails when a Python directive comment changed, standalone or trailing", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      {
        "app/loader.py":
          "# type: ignore\nimport vendor_sdk\n\nHANDLE = vendor_sdk.open()  # type: ignore[attr-defined]\n",
      },
      "python base",
    );
    commitFiles(
      cwd,
      {
        "app/loader.py":
          "import vendor_sdk\n\nHANDLE = vendor_sdk.open()  # type: ignore[union-attr]\n",
      },
      "directive",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual([
      "-# type: ignore",
      "-HANDLE = vendor_sdk.open()  # type: ignore[attr-defined]",
      "+HANDLE = vendor_sdk.open()  # type: ignore[union-attr]",
    ]);
  });

  it("passes a docstring trim in a renamed Python file", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      {
        "app/old_name.py": `"""Module docstring.\n\nA second paragraph.\n"""\n${RENAMED_BODY}`,
      },
      "python base",
    );
    git(cwd, "mv", "app/old_name.py", "app/new_name.py");
    commitFiles(
      cwd,
      {
        "app/new_name.py": `"""Module docstring."""\n${RENAMED_BODY}`,
      },
      "rename and trim",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.stdout).toBe("only comment lines changed");
    expect(result.status).toBe(0);
  });

  it("reports only the PHP code line in a diff that also trims a Python docstring", () => {
    const cwd = makeRepo();
    commitFiles(cwd, { "app/totals.py": TOTALS_PY }, "python base");
    commitFiles(
      cwd,
      {
        "app/totals.py": "'''Totals.'''\nTOTAL = 1\n",
        "app/Thing.php":
          "<?php\nclass Thing\n{\n    public function go(): int\n    {\n    }\n}\n",
      },
      "mixed",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual([
      "-    public function go(): void",
      "+    public function go(): int",
    ]);
  });

  it("checks a Python file that does not parse with the regex, and names it on stderr", () => {
    const cwd = makeRepo();
    commitFiles(cwd, { "app/broken.py": "def broken(:\n# old note\n" }, "base");
    commitFiles(cwd, { "app/broken.py": "def broken(:\n# new note\n" }, "note");

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("only comment lines changed");
    expect(result.stderr).toContain("app/broken.py");
  });

  it("uses the regex filter for Python, and warns once, when python3 is missing", () => {
    const cwd = makeRepo();
    commitFiles(cwd, { "app/totals.py": TOTALS_PY }, "python base");
    commitFiles(cwd, { "app/totals.py": "'''Totals.'''\nTOTAL = 1\n" }, "trim");

    const result = runWithEnv(
      NO_PYTHON,
      "verify-comments-only.sh",
      cwd,
      "HEAD~1",
      "HEAD",
      "app",
    );

    // The pre-change behaviour: ''' lines and docstring interiors carry no marker.
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("-One line of why.");
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("python3-not-installed not found");
  });

  it("fails when a triple-quoted string that is not a docstring changed", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      { "app/queries.py": '"""Queries."""\nQUERY = """\nselect 1\n"""\n' },
      "python base",
    );
    commitFiles(
      cwd,
      { "app/queries.py": '"""Queries."""\nQUERY = """\nselect 2\n"""\n' },
      "query",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual(["-select 1", "+select 2"]);
  });

  it("passes a docstring trim in a Python file whose path has spaces", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      { "app/my module.py": '"""One.\n\nTwo.\n"""\nX = 1\n' },
      "python base",
    );
    commitFiles(cwd, { "app/my module.py": '"""One."""\nX = 1\n' }, "trim");

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.stdout).toBe("only comment lines changed");
    expect(result.status).toBe(0);
  });

  it("fails on a Python code change when run from a subdirectory", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "lib"));
    commitFiles(cwd, { "lib/calc.py": '"""Calc."""\nX = 1\n' }, "python base");
    commitFiles(cwd, { "lib/calc.py": '"""Calc."""\nX = 2\n' }, "code");

    const result = run(
      "verify-comments-only.sh",
      join(cwd, "app"),
      "HEAD~1",
      "HEAD",
    );

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual(["-X = 1", "+X = 2"]);
  });

  it("fails when a one-line def that holds its docstring is renamed", () => {
    const cwd = makeRepo();
    commitFiles(cwd, { "app/one.py": 'def f(): """doc"""\n' }, "python base");
    commitFiles(cwd, { "app/one.py": 'def g(): """doc"""\n' }, "rename");

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual([
      '-def f(): """doc"""',
      '+def g(): """doc"""',
    ]);
  });

  it("fails when only a ty or pyrefly directive line changed", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      {
        "app/sdk.py":
          "import sdk\n\n# pyrefly: ignore\nA = sdk.a()\n# ty: ignore[unresolved-attribute]\nB = sdk.b()\n",
      },
      "python base",
    );
    commitFiles(
      cwd,
      { "app/sdk.py": "import sdk\n\nA = sdk.a()\nB = sdk.b()\n" },
      "directives",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual([
      "-# pyrefly: ignore",
      "-# ty: ignore[unresolved-attribute]",
    ]);
  });

  it("fails and names the file when the trim leaves a Python file that does not parse", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      {
        "app/proto.py":
          'from typing import Protocol\n\n\nclass P(Protocol):\n    """Doc."""\n',
      },
      "python base",
    );
    commitFiles(
      cwd,
      {
        "app/proto.py": "from typing import Protocol\n\n\nclass P(Protocol):\n",
      },
      "trim",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual([
      "app/proto.py: does not parse as Python at HEAD",
    ]);
  });

  it("fails on the code lines of a deleted Python file", () => {
    const cwd = makeRepo();
    commitFiles(cwd, { "app/totals.py": TOTALS_PY }, "python base");
    git(cwd, "rm", "-q", "app/totals.py");
    git(cwd, "commit", "-q", "-m", "delete");

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual(["-TOTAL = 1"]);
  });

  it("exits 2 and names the ref when a ref does not exist", () => {
    const cwd = makeRepo();

    const result = run("verify-comments-only.sh", cwd, "no-such-ref", "HEAD");

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("no-such-ref");
  });
});
