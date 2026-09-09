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

function run(
  script: string,
  cwd: string,
  ...args: string[]
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("bash", [join(scriptsDir, script), ...args], {
    cwd,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr,
  };
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
});
