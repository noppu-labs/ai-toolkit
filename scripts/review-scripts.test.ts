import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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

// An interpreter that prints `boom` to stderr and exits 1 for every call.
function makeFailingPython(): string {
  const dir = mkdtempSync(join(tmpdir(), "review-scripts-python-"));
  const path = join(dir, "python");
  writeFileSync(path, "#!/bin/sh\necho boom >&2\nexit 1\n", { mode: 0o755 });
  return path;
}

// An interpreter that fails only when asked about `ref` (the helper's first
// argument after the script) and otherwise defers to python3.
function makeSideFailingPython(ref: string): string {
  const real = spawnSync("sh", ["-c", "command -v python3"], {
    encoding: "utf8",
  }).stdout.trim();
  const dir = mkdtempSync(join(tmpdir(), "review-scripts-python-"));
  const path = join(dir, "python");
  writeFileSync(
    path,
    `#!/bin/sh\nif [ "$2" = "${ref}" ]; then echo boom >&2; exit 1; fi\nexec "${real}" "$@"\n`,
    { mode: 0o755 },
  );
  return path;
}

const COUNTED_TOOLS: readonly string[] = [
  "git",
  "awk",
  "grep",
  "sed",
  "head",
  "tr",
  "cut",
  "sort",
  "wc",
  "cat",
  "mktemp",
  "rm",
  "dirname",
  "basename",
  "python3",
];

// A PATH entry of wrappers that append the tool's name to `log` and exec the
// real tool, so a test can count the external processes a script starts.
function makeCountingPath(log: string): string {
  const dir = mkdtempSync(join(tmpdir(), "review-scripts-path-"));
  for (const tool of COUNTED_TOOLS) {
    const real = spawnSync("sh", ["-c", `command -v ${tool}`], {
      encoding: "utf8",
    }).stdout.trim();
    if (real === "") {
      continue;
    }
    writeFileSync(
      join(dir, tool),
      `#!/bin/sh\necho ${tool} >> "${log}"\nexec "${real}" "$@"\n`,
      { mode: 0o755 },
    );
  }
  return dir;
}

function countLogged(log: string): number {
  const text = readFileSync(log, "utf8").trim();
  return text === "" ? 0 : text.split("\n").length;
}

// Runs lib.sh's route_diff over a hand-built stream: registry lines, helper
// sections, then a patch.
function routeDiff(mode: string, stream: string): RunResult {
  const result = spawnSync(
    "bash",
    [
      "-c",
      'source "$1" && route_diff "$2" FROM TO',
      "lib",
      join(scriptsDir, "lib.sh"),
      mode,
    ],
    { encoding: "utf8", input: stream },
  );
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr,
  };
}

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

// 28 lines. The helper counts 9 of them: the module docstring (2, 4, 5), the
// ''' class docstring (14), the r""" method docstring (17, 19, 20), the
// own-line comment (21), and the function docstring (26). The shebang, both `# fmt:`
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

// A Python module that git still pairs as a rename when it moves to or from
// another extension, with or without a one-line change.
const MIXED_PY: string = `"""Module docstring."""\n# why\nX = 1\n${RENAMED_BODY}`;

// Enough unchanged lines that git still pairs a copy of it with its source.
const COPIED_PY: string = `"""Mod."""\nx0 = 0\n${RENAMED_BODY}`;

// A docstring with a doctest, which pytest --doctest-modules runs as a test.
const DOCTEST_PY: string = [
  "def total(xs: list[int]) -> int:",
  '    """Sum xs.',
  "",
  "    >>> total([1, 2])",
  "    3",
  '    """',
  "    return sum(xs)",
  "",
].join("\n");

// A plain string with an invalid escape, which ast.parse warns about on
// stderr from Python 3.12.
const INVALID_ESCAPE_PY: string = 'DIGITS = "\\d+"\n';

// On a feature branch, adds a `// caf\xe9 comment` line and a code line to
// app/a.js and adds app/caf\xe9.py holding TOTALS_PY: a Latin-1 byte in
// a changed line and in a path. The path goes straight into the index,
// because APFS refuses a file name that is not UTF-8.
function commitLatin1Change(cwd: string): void {
  commitFiles(cwd, { "app/a.js": "x = 1\n" }, "js base");
  git(cwd, "checkout", "-q", "-b", "feature");
  writeFileSync(
    join(cwd, "app", "a.js"),
    Buffer.concat([
      Buffer.from("// caf"),
      Buffer.from([0xe9]),
      Buffer.from(" comment\nx = 1\nx = 2\n"),
    ]),
  );
  git(cwd, "add", "app/a.js");
  const sha = spawnSync("git", ["hash-object", "-w", "--stdin"], {
    cwd,
    encoding: "utf8",
    input: TOTALS_PY,
  }).stdout.trim();
  const index = spawnSync("git", ["update-index", "--add", "--index-info"], {
    cwd,
    input: Buffer.concat([
      Buffer.from(`100644 ${sha}\tapp/caf`),
      Buffer.from([0xe9]),
      Buffer.from(".py\n"),
    ]),
  });
  expect(index.status).toBe(0);
  git(cwd, "commit", "-q", "-m", "latin-1");
}

const UTF8_LOCALE: Record<string, string> = { LC_ALL: "en_US.UTF-8" };

function renameAcrossExtensions(
  cwd: string,
  from: string,
  to: string,
  content: string = MIXED_PY,
): void {
  commitFiles(cwd, { [`app/${from}`]: MIXED_PY }, "python base");
  git(cwd, "checkout", "-q", "-b", "feature");
  git(cwd, "mv", `app/${from}`, `app/${to}`);
  commitFiles(cwd, { [`app/${to}`]: content }, "rename");
}

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
    expect(result.stdout).toBe("9");
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
    // PHP "// why" is 1. Python is the three docstring lines that are not blank; the noqa line is a directive.
    expect(result.stdout).toBe("4");
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
    expect(result.stdout).toBe("7");
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
      "4",
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

    expect(fromRoot.stdout).toBe("4");
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
    // The three text lines of the second docstring. The first shares its line with code.
    expect(result.stdout).toBe("3");
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

  it("counts nothing for a .py file renamed to .txt with no change", () => {
    const cwd = makeRepo();
    renameAcrossExtensions(cwd, "b.py", "b.txt");

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("0");
  });

  it("counts nothing for a .txt file renamed to .py with no change", () => {
    const cwd = makeRepo();
    renameAcrossExtensions(cwd, "b.txt", "b.py");

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("0");
  });

  it("counts only the comment a .py to .txt rename adds", () => {
    const cwd = makeRepo();
    renameAcrossExtensions(
      cwd,
      "b.py",
      "b.txt",
      MIXED_PY.replace("X = 1", "# added\nX = 1"),
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("1");
  });

  it("counts a file whose name is a glob once, and the file the glob matches once", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      { "app/test_a.py": "# a\nX = 1\n", "app/test_[ab].py": "# ab\nY = 1\n" },
      "feature",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("2");
  });

  it("prints the helper's own error line when the helper fails", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(cwd, { "app/calc.py": "# why\nX = 1\n" }, "feature");

    const result = runWithEnv(
      { REVIEW_PYTHON: makeFailingPython() },
      "count-comment-lines.sh",
      cwd,
      "main",
      "feature",
      "app",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("1");
    expect(result.stderr).toContain(
      "count-comment-lines.sh: boom; counted by the regex",
    );
  });

  it("counts the same from a subdirectory as from the root when diff.relative is set", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "pkg"));
    commitFiles(cwd, { "pkg/a.py": "X = 1\n" }, "python base");
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(cwd, { "pkg/a.py": '"""Doc."""\n# why\nX = 2\n' }, "feature");
    git(cwd, "config", "diff.relative", "true");

    const fromRoot = run("count-comment-lines.sh", cwd, "main", "feature");
    const fromPkg = run(
      "count-comment-lines.sh",
      join(cwd, "pkg"),
      "main",
      "feature",
    );

    expect(fromRoot.stdout).toBe("2");
    expect(fromPkg.status).toBe(0);
    expect(fromPkg.stdout).toBe(fromRoot.stdout);
  });

  it("counts a copied Python file as an added file", () => {
    const cwd = makeRepo();
    git(cwd, "config", "diff.renames", "copies");
    commitFiles(cwd, { "app/a.py": COPIED_PY }, "python base");
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      {
        "app/a.py": COPIED_PY.replace("x0 = 0", "# added\nx0 = 0"),
        "app/b.py": COPIED_PY,
      },
      "copy",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    // "# added" in a.py, and the docstring of the new b.py.
    expect(result.stdout).toBe("2");
  });

  it("does not count noqa or pragma no cover in another case, and still counts a capitalised prose word", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      {
        "app/marks.py":
          "# NOQA\n# pragma no cover\n# PRAGMA: NO COVER\n# Type: the invoice kind\nKIND = 1\n",
      },
      "feature",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("1");
  });

  it("does not count the doctest lines of a docstring", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(cwd, { "app/calc.py": DOCTEST_PY }, "feature");

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    // The opening and closing lines of the docstring.
    expect(result.stdout).toBe("2");
  });

  it("does not count the blank lines inside a docstring", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(cwd, { "app/doc.py": '"""Doc.\n\n\nMore."""\n' }, "feature");

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("2");
  });

  it("counts several Python files with the helper and only the one that does not parse with the regex", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      {
        "app/a.py": TOTALS_PY,
        "app/broken.py":
          'def broken(:\n    """Doc.\n\n    More.\n    """\n# note\n',
        "app/c.py": "# why\nX = 1\n",
      },
      "feature",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    // a.py 3 by the helper, broken.py 3 by the regex, c.py 1 by the helper.
    expect(result.stdout).toBe("7");
    expect(result.stderr).toContain("app/broken.py");
    expect(result.stderr).not.toContain("app/a.py");
    expect(result.stderr).not.toContain("app/c.py");
  });

  it("counts a Python file whose path has non-ASCII characters with the helper", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(cwd, { "app/café.py": TOTALS_PY }, "feature");

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    // The regex would see 0 (it only matches """ quotes); the helper sees the docstring.
    expect(result.stdout).toBe("3");
  });

  it("counts the same when diff.noprefix is set", () => {
    const cwd = makeRepo();
    git(cwd, "config", "diff.noprefix", "true");
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(cwd, { "app/a.py": TOTALS_PY }, "feature");

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("3");
  });

  it("counts 0 for a Python file with no comment lines beside one that has them", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      { "app/a.py": "X = 1\nY = 2\n", "app/b.py": TOTALS_PY },
      "feature",
    );

    const result = run("count-comment-lines.sh", cwd, "main", "feature", "app");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("3");
  });

  it("warns about every Python file when the helper dies, and counts them with the regex", () => {
    const cwd = makeRepo();
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(
      cwd,
      { "app/a.py": "# why\nX = 1\n", "app/b.py": "# why not\nY = 1\n" },
      "feature",
    );

    const result = runWithEnv(
      { REVIEW_PYTHON: makeFailingPython() },
      "count-comment-lines.sh",
      cwd,
      "main",
      "feature",
      "app",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("2");
    expect(
      result.stderr.split("\n").filter((line) => line.includes("boom")),
    ).toHaveLength(2);
  });

  it("exits 2 and names the ref when a ref does not exist", () => {
    const cwd = makeRepo();

    const result = run("count-comment-lines.sh", cwd, "no-such-ref", "main");

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("no-such-ref");
  });

  it("counts a comment holding a byte that is not UTF-8, and a Python file whose path holds one, under a UTF-8 locale", () => {
    const cwd = makeRepo();
    commitLatin1Change(cwd);

    const result = runWithEnv(
      UTF8_LOCALE,
      "count-comment-lines.sh",
      cwd,
      "main",
      "feature",
      "app",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("4");
    expect(result.stderr).toBe("");
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

    // The regex filter has no marker for `'''` lines or docstring interiors, so they are hits.
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

  it("passes a .py file renamed to .txt with no change", () => {
    const cwd = makeRepo();
    renameAcrossExtensions(cwd, "b.py", "b.txt");

    const result = run(
      "verify-comments-only.sh",
      cwd,
      "main",
      "feature",
      "app",
    );

    expect(result.stdout).toBe("only comment lines changed");
    expect(result.status).toBe(0);
  });

  it("passes a .txt file renamed to .py with no change", () => {
    const cwd = makeRepo();
    renameAcrossExtensions(cwd, "b.txt", "b.py");

    const result = run(
      "verify-comments-only.sh",
      cwd,
      "main",
      "feature",
      "app",
    );

    expect(result.stdout).toBe("only comment lines changed");
    expect(result.status).toBe(0);
  });

  it("fails on only the code line a .py to .txt rename changes", () => {
    const cwd = makeRepo();
    renameAcrossExtensions(
      cwd,
      "b.py",
      "b.txt",
      MIXED_PY.replace("X = 1", "X = 2"),
    );

    const result = run(
      "verify-comments-only.sh",
      cwd,
      "main",
      "feature",
      "app",
    );

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual(["-X = 1", "+X = 2"]);
  });

  it("fails on only the code line a .py to .md rename changes", () => {
    const cwd = makeRepo();
    renameAcrossExtensions(
      cwd,
      "b.py",
      "b.md",
      MIXED_PY.replace("X = 1", "X = 2"),
    );

    const result = run(
      "verify-comments-only.sh",
      cwd,
      "main",
      "feature",
      "app",
    );

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual(["-X = 1", "+X = 2"]);
  });

  it("fails on only the code line a .txt to .py rename changes", () => {
    const cwd = makeRepo();
    renameAcrossExtensions(
      cwd,
      "b.txt",
      "b.py",
      MIXED_PY.replace("X = 1", "X = 2"),
    );

    const result = run(
      "verify-comments-only.sh",
      cwd,
      "main",
      "feature",
      "app",
    );

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual(["-X = 1", "+X = 2"]);
  });

  it("reports a code change once when another file's name is a glob that matches it", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      { "app/test_a.py": "# a\nX = 1\n", "app/test_[ab].py": "# ab\nY = 1\n" },
      "python base",
    );
    commitFiles(
      cwd,
      {
        "app/test_a.py": "# a\nX = 2\n",
        "app/test_[ab].py": "# ab, reworded\nY = 1\n",
      },
      "code",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual(["-X = 1", "+X = 2"]);
  });

  it("prints the helper's own error line when the helper fails", () => {
    const cwd = makeRepo();
    commitFiles(cwd, { "app/calc.py": "# why\nX = 1\n" }, "python base");
    commitFiles(cwd, { "app/calc.py": "# why not\nX = 1\n" }, "note");

    const result = runWithEnv(
      { REVIEW_PYTHON: makeFailingPython() },
      "verify-comments-only.sh",
      cwd,
      "HEAD~1",
      "HEAD",
      "app",
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      "verify-comments-only.sh: boom; checked with the regex",
    );
  });

  it("fails when a directive after a docstring's closing quotes changed", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      {
        "app/doc.py": 'def f():\n    """Doc."""  # noqa: D400\n    return 1\n',
      },
      "python base",
    );
    commitFiles(
      cwd,
      {
        "app/doc.py": 'def f():\n    """Doc."""  # noqa: D401\n    return 1\n',
      },
      "directive",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual([
      '-    """Doc."""  # noqa: D400',
      '+    """Doc."""  # noqa: D401',
    ]);
  });

  it("reports the same hits from a subdirectory as from the root when diff.relative is set", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "pkg"));
    commitFiles(cwd, { "pkg/a.py": "X = 1\n" }, "python base");
    commitFiles(cwd, { "pkg/a.py": '"""Doc."""\n# why\nX = 2\n' }, "code");
    git(cwd, "config", "diff.relative", "true");

    const fromRoot = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD");
    const fromPkg = run(
      "verify-comments-only.sh",
      join(cwd, "pkg"),
      "HEAD~1",
      "HEAD",
    );

    expect(fromRoot.status).toBe(1);
    expect(fromRoot.stdout.split("\n")).toEqual(["-X = 1", "+X = 2"]);
    expect(fromPkg.status).toBe(1);
    expect(fromPkg.stdout).toBe(fromRoot.stdout);
  });

  it("reports each hit of a copy's source once", () => {
    const cwd = makeRepo();
    git(cwd, "config", "diff.renames", "copies");
    commitFiles(cwd, { "app/a.py": COPIED_PY }, "python base");
    commitFiles(
      cwd,
      {
        "app/a.py": COPIED_PY.replace("x0 = 0", "# added\nx0 = 99"),
        "app/b.py": COPIED_PY,
      },
      "copy",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");
    const lines = result.stdout.split("\n");

    expect(result.status).toBe(1);
    expect(lines.filter((line) => line === "-x0 = 0")).toHaveLength(1);
    expect(lines.filter((line) => line === "+x0 = 99")).toHaveLength(1);
  });

  it("fails when a doctest line in a docstring changed", () => {
    const cwd = makeRepo();
    commitFiles(cwd, { "app/calc.py": DOCTEST_PY }, "python base");
    commitFiles(
      cwd,
      { "app/calc.py": DOCTEST_PY.replace("    3\n", "    4\n") },
      "doctest",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual(["-    3", "+    4"]);
  });

  it("checks only the Python file that does not parse at FROM with the regex, in a batch", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      {
        "app/good.py": TOTALS_PY,
        "app/broken.py": "def broken(:\n# note\n",
      },
      "python base",
    );
    commitFiles(
      cwd,
      {
        "app/good.py": "'''Totals.'''\nTOTAL = 1\n",
        "app/broken.py": "def broken(:\n# other note\n",
      },
      "trim",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("only comment lines changed");
    expect(result.stderr).toContain("app/broken.py");
    expect(result.stderr).not.toContain("app/good.py");
  });

  it("fails and names every Python file when the helper fails at TO only", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      { "app/a.py": TOTALS_PY, "app/b.py": TOTALS_PY },
      "python base",
    );
    commitFiles(
      cwd,
      {
        "app/a.py": "'''Totals.'''\nTOTAL = 1\n",
        "app/b.py": "'''Totals.'''\nTOTAL = 1\n",
      },
      "trim",
    );

    const result = runWithEnv(
      { REVIEW_PYTHON: makeSideFailingPython("HEAD") },
      "verify-comments-only.sh",
      cwd,
      "HEAD~1",
      "HEAD",
      "app",
    );

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual([
      "app/a.py: does not parse as Python at HEAD",
      "app/b.py: does not parse as Python at HEAD",
    ]);
  });

  it("pairs a rename and does not pair a copy inside one batched diff", () => {
    const cwd = makeRepo();
    git(cwd, "config", "diff.renames", "copies");
    commitFiles(
      cwd,
      { "app/a.py": COPIED_PY, "app/m.py": MIXED_PY },
      "python base",
    );
    git(cwd, "mv", "app/m.py", "app/n.py");
    commitFiles(
      cwd,
      {
        "app/a.py": COPIED_PY.replace("x0 = 0", "# added\nx0 = 0"),
        "app/b.py": COPIED_PY,
        "app/n.py": MIXED_PY.replace("# why\n", ""),
      },
      "copy and rename",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");
    const lines = result.stdout.split("\n");

    expect(result.status).toBe(1);
    // b.py is an added file, so its code is a hit once; a paired copy would
    // show no x0 line at all.
    expect(lines.filter((line) => line === "+x0 = 0")).toHaveLength(1);
    // n.py is paired with m.py, so its unchanged code is not a hit. The one
    // added "def first" line is b.py's; an unpaired n.py would make it two.
    expect(lines).not.toContain("-def first() -> int:");
    expect(
      lines.filter((line) => line === "+def first() -> int:"),
    ).toHaveLength(1);
    expect(lines).not.toContain("-# why");
  });

  it("pairs a renamed Python file when diff.renames is false", () => {
    const cwd = makeRepo();
    git(cwd, "config", "diff.renames", "false");
    commitFiles(cwd, { "app/m.py": MIXED_PY }, "python base");
    git(cwd, "mv", "app/m.py", "app/n.py");
    commitFiles(cwd, { "app/n.py": MIXED_PY.replace("# why\n", "") }, "rename");

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("only comment lines changed");
  });

  it("fails on a code change when another file's name holds a newline that reads as a helper section", () => {
    const cwd = makeRepo();
    commitFiles(cwd, { "evil.py": "def f():\n    return 1\n" }, "python base");
    commitFiles(
      cwd,
      {
        "evil.py": "def f():\n    import os\n    return 1\n",
        "zzz\n== to 0\nevil.py\t2\nq": "# hi\n",
      },
      "change",
    );

    for (const env of [{}, NO_PYTHON]) {
      const result = runWithEnv(
        env,
        "verify-comments-only.sh",
        cwd,
        "HEAD~1",
        "HEAD",
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("+    import os");
    }
  });

  it("fails on a changed directive when another file's name holds a tab and does not parse at FROM", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      {
        "app/evil.py": "# type: ignore\nimport os\n",
        "app/evil.py\tx.py": "def b(:\n# a\n",
      },
      "python base",
    );
    commitFiles(
      cwd,
      {
        "app/evil.py": "# pyright: basic\nimport os\n",
        "app/evil.py\tx.py": "def b(:\n# b\n",
      },
      "trim",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual([
      "-# type: ignore",
      "+# pyright: basic",
    ]);
  });

  it("fails on a code change beside a Python file in a directory named like a helper section", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "== to 0"));
    commitFiles(
      cwd,
      { "== to 0/x.py": "# one\nX = 1\n", "p.py": "# c\nX = 1\n" },
      "python base",
    );
    commitFiles(
      cwd,
      { "== to 0/x.py": "# one\n\nX = 1\n", "p.py": "import os\n# c\nX = 1\n" },
      "change",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD");

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("+import os");
  });

  it("fails on a changed directive when another file warns while parsing and a third does not parse at FROM", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      {
        "app/a.py": `# Digits, as a long note.\n${INVALID_ESCAPE_PY}`,
        "app/legacy.py": 'print "legacy"\n# note\n',
        "app/c.py": "# type: ignore\nimport os\n",
      },
      "python base",
    );
    commitFiles(
      cwd,
      {
        "app/a.py": `# Digits.\n${INVALID_ESCAPE_PY}`,
        "app/legacy.py": 'print "legacy"\n# note trimmed\n',
        "app/c.py": "# pyright: basic\nimport os\n",
      },
      "trim",
    );

    const result = run("verify-comments-only.sh", cwd, "HEAD~1", "HEAD", "app");

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual([
      "-# type: ignore",
      "+# pyright: basic",
    ]);
    expect(result.stderr).toContain("app/legacy.py");
    expect(result.stderr).not.toContain("SyntaxWarning");
  });

  it("exits 2 and names the ref when a ref does not exist", () => {
    const cwd = makeRepo();

    const result = run("verify-comments-only.sh", cwd, "no-such-ref", "HEAD");

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("no-such-ref");
  });

  it("fails on a code change beside a comment holding a byte that is not UTF-8 and a Python file whose path holds one, under a UTF-8 locale", () => {
    const cwd = makeRepo();
    commitLatin1Change(cwd);

    const result = runWithEnv(
      UTF8_LOCALE,
      "verify-comments-only.sh",
      cwd,
      "main",
      "feature",
      "app",
    );

    expect(result.status).toBe(1);
    expect(result.stdout.split("\n")).toEqual(["+x = 2", "+TOTAL = 1"]);
    expect(result.stderr).toBe("");
  });
});

describe("process budget", () => {
  it("runs count and verify over 200 Python files in fewer than 20 processes each", () => {
    const cwd = makeRepo();
    const base: Record<string, string> = {};
    const changed: Record<string, string> = {};
    for (let i = 0; i < 200; i++) {
      base[`app/m${i}.py`] = TOTALS_PY;
      changed[`app/m${i}.py`] = `${TOTALS_PY}# note ${i}\n`;
    }
    for (let i = 0; i < 20; i++) {
      base[`app/C${i}.php`] = `<?php\nclass C${i}\n{\n}\n`;
      changed[`app/C${i}.php`] = `<?php\n// why\nclass C${i}\n{\n}\n`;
    }
    commitFiles(cwd, base, "base files");
    git(cwd, "checkout", "-q", "-b", "feature");
    commitFiles(cwd, changed, "notes");
    const log = join(
      mkdtempSync(join(tmpdir(), "review-scripts-log-")),
      "processes",
    );
    const shims = makeCountingPath(log);
    const env: Record<string, string> = {
      PATH: `${shims}:${process.env.PATH ?? ""}`,
      REVIEW_PYTHON: join(shims, "python3"),
    };

    writeFileSync(log, "");
    const count = runWithEnv(
      env,
      "count-comment-lines.sh",
      cwd,
      "main",
      "feature",
      "app",
    );
    const countProcesses = countLogged(log);
    writeFileSync(log, "");
    const verify = runWithEnv(
      env,
      "verify-comments-only.sh",
      cwd,
      "main",
      "feature",
      "app",
    );
    const verifyProcesses = countLogged(log);

    expect(count.status).toBe(0);
    expect(count.stdout).toBe("220");
    expect(countProcesses).toBeLessThan(20);
    expect(verify.status).toBe(0);
    expect(verify.stdout).toBe("only comment lines changed");
    expect(verifyProcesses).toBeLessThan(20);
  });
});

describe("lib.sh", () => {
  it("defines the five helper functions both scripts call", () => {
    const result = spawnSync(
      "bash",
      [
        "-c",
        'source "$1" && for f in check_refs git_diff read_change read_changes route_diff; do echo "$f $(type -t "$f")"; done',
        "lib",
        join(scriptsDir, "lib.sh"),
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual([
      "check_refs function",
      "git_diff function",
      "read_change function",
      "read_changes function",
      "route_diff function",
    ]);
  });

  it("routes a listed Python file by its line numbers and every other file by the regex", () => {
    const stream = [
      "M\t\tapp/a.py",
      "M\t\tapp/b.php",
      "== to 0",
      "app/a.py\t2",
      "== diff",
      "diff --git a/app/a.py b/app/a.py",
      "--- a/app/a.py",
      "+++ b/app/a.py",
      "@@ -1,0 +2,2 @@",
      '+"""Doc."""',
      "+x = 1  # note",
      "diff --git a/app/b.php b/app/b.php",
      "--- a/app/b.php",
      "+++ b/app/b.php",
      "@@ -1,0 +2,2 @@",
      "+// why",
      "+$x = 1;",
      "",
    ].join("\n");

    const count = routeDiff("count", stream);
    const verify = routeDiff("verify", stream);

    expect(count.status).toBe(0);
    expect(count.stdout).toBe("2");
    expect(verify.stdout.split("\n")).toEqual(["+x = 1  # note", "+$x = 1;"]);
  });

  it("fails every file of a side whose helper died, skips markdown on both sides, and does not reach a TO failure once FROM failed", () => {
    const stream = [
      "M\t\tapp/a.py",
      "M\t\tapp/b.py",
      "R100\tdocs/old.md\tdocs/new.md",
      "== from 1",
      "boom",
      "== to 1",
      "app/b.py\tpython-comment-lines.py: app/b.py at TO: bad",
      "== diff",
      "diff --git a/app/a.py b/app/a.py",
      "--- a/app/a.py",
      "+++ b/app/a.py",
      "@@ -1 +1 @@",
      "-# old",
      "+# new",
      "diff --git a/app/b.py b/app/b.py",
      "--- a/app/b.py",
      "+++ b/app/b.py",
      "@@ -1 +1 @@",
      "-x = 1",
      "+x = 2",
      "diff --git a/docs/old.md b/docs/new.md",
      "similarity index 90%",
      "rename from docs/old.md",
      "rename to docs/new.md",
      "--- a/docs/old.md",
      "+++ b/docs/new.md",
      "@@ -1 +1 @@",
      "-# Old",
      "+New prose",
      "",
    ].join("\n");

    const verify = routeDiff("verify", stream);

    // Both Python files failed at FROM (the interpreter died), so both use
    // the regex: a.py's comment change is not a hit, b.py's code change is.
    // The markdown rename is skipped. b.py's TO failure is never reached.
    expect(verify.stdout.split("\n")).toEqual(["-x = 1", "+x = 2"]);
    expect(verify.stderr).toContain(
      "verify-comments-only.sh: boom; checked with the regex",
    );
    expect(
      verify.stderr.split("\n").filter((l) => l.includes("boom")),
    ).toHaveLength(2);
    expect(verify.stdout).not.toContain("New prose");
  });

  it("makes each script exit 2 and name lib.sh when lib.sh is missing", () => {
    const cwd = makeRepo();
    const bare = mkdtempSync(join(tmpdir(), "review-scripts-no-lib-"));

    for (const script of [
      "count-comment-lines.sh",
      "verify-comments-only.sh",
    ]) {
      copyFileSync(join(scriptsDir, script), join(bare, script));

      const result = spawnSync("bash", [join(bare, script), "main", "main"], {
        cwd,
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`${script}: cannot read`);
      expect(result.stderr).toContain("lib.sh");
    }
  });
});

describe("python-comment-lines.py", () => {
  const helper: string = join(scriptsDir, "python-comment-lines.py");

  function runHelper(cwd: string, input: string, ...args: string[]): RunResult {
    const result = spawnSync("python3", [helper, ...args], {
      cwd,
      encoding: "utf8",
      input,
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  it("prints a path and line record for every path on stdin, and keeps the REF PATH form", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      { "app/a.py": TOTALS_PY, "app/b.py": "# why\nX = 1\n" },
      "python",
    );

    const batch = runHelper(cwd, "app/a.py\0app/b.py\0", "HEAD");
    const single = runHelper(cwd, "", "HEAD", "app/a.py");

    expect(batch.status).toBe(0);
    expect(batch.stderr).toBe("");
    expect(batch.stdout).toBe(
      "app/a.py\t1\napp/a.py\t3\napp/a.py\t4\napp/b.py\t1\n",
    );
    expect(single.status).toBe(0);
    expect(single.stdout).toBe("1\n3\n4\n");
  });

  it("reports a missing path and one that does not parse on stderr, skips them, and exits 1", () => {
    const cwd = makeRepo();
    commitFiles(
      cwd,
      { "app/a.py": TOTALS_PY, "app/broken.py": "def broken(:\n# note\n" },
      "python",
    );

    const result = runHelper(
      cwd,
      "app/a.py\0app/nope.py\0app/broken.py\0",
      "HEAD",
    );
    const errors = result.stderr.trimEnd().split("\n");

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("app/a.py\t1\napp/a.py\t3\napp/a.py\t4\n");
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(
      /^app\/nope\.py\tpython-comment-lines\.py: app\/nope\.py at HEAD: missing/,
    );
    expect(errors[1]).toMatch(
      /^app\/broken\.py\tpython-comment-lines\.py: app\/broken\.py at HEAD: /,
    );
  });

  it("prints nothing and exits 0 on empty input", () => {
    const cwd = makeRepo();

    const result = runHelper(cwd, "", "HEAD");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("exits 2 on a usage error", () => {
    const cwd = makeRepo();

    const result = runHelper(cwd, "", "HEAD", "a.py", "b.py");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "usage: python-comment-lines.py REF [PATH]",
    );
  });
});
