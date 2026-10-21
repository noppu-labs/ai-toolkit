import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(
  import.meta.dirname,
  "..",
  "review",
  "skills",
  "pr-review",
  "scripts",
  "pr-size.sh",
);

type RunResult = { status: number | null; stdout: string; stderr: string };

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function run(cwd: string, ...args: string[]): RunResult {
  const result = spawnSync("bash", [script, ...args], {
    cwd,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr,
  };
}

function lines(count: number, prefix = "line"): string {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i}\n`).join("");
}

function write(cwd: string, path: string, content: string | Buffer): void {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

function makeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "review-pr-size-"));
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "t@example.com");
  git(cwd, "config", "user.name", "t");
  write(cwd, "README.md", "# Thing\n");
  write(cwd, "app/Thing.php", lines(40));
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "base");
  git(cwd, "checkout", "-q", "-b", "feature");
  return cwd;
}

function commit(cwd: string): void {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "change");
}

describe("pr-size.sh", () => {
  it("counts added plus deleted lines", () => {
    const cwd = makeRepo();
    write(cwd, "app/New.php", lines(7));
    write(cwd, "README.md", "# Other\n");
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe(
      "lines=9 code-review=high correctness-review=1",
    );
  });

  it("leaves out lockfiles at any depth", () => {
    const cwd = makeRepo();
    write(cwd, "composer.lock", lines(4000));
    write(cwd, "web/yarn.lock", lines(4000));
    write(cwd, "package-lock.json", lines(4000));
    write(cwd, "site/package-lock.json", lines(4000));
    write(cwd, "npm-shrinkwrap.json", lines(4000));
    write(cwd, "web/pnpm-lock.yaml", lines(4000));
    write(cwd, "tools/go.sum", lines(4000));
    write(cwd, "app/New.php", lines(5));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe(
      "lines=5 code-review=high correctness-review=1",
    );
  });

  it("counts a binary file as zero", () => {
    const cwd = makeRepo();
    write(cwd, "public/logo.png", Buffer.from([0, 1, 2, 0, 255, 0, 10, 0]));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe(
      "lines=0 code-review=high correctness-review=1",
    );
  });

  it("counts a file moved without edits as zero", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "src"));
    renameSync(join(cwd, "app", "Thing.php"), join(cwd, "src", "Thing.php"));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe(
      "lines=0 code-review=high correctness-review=1",
    );
  });

  it("counts only the edited lines of a moved file", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "src"));
    write(cwd, "src/Thing.php", lines(40).replace("line 3\n", "edited\n"));
    git(cwd, "rm", "-q", "app/Thing.php");
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe(
      "lines=2 code-review=high correctness-review=1",
    );
  });

  it("detects moves when the clone turns rename detection off", () => {
    const cwd = makeRepo();
    git(cwd, "config", "diff.renames", "false");
    mkdirSync(join(cwd, "src"));
    renameSync(join(cwd, "app", "Thing.php"), join(cwd, "src", "Thing.php"));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe(
      "lines=0 code-review=high correctness-review=1",
    );
  });

  it("steps each decision at its own boundaries", () => {
    const cwd = makeRepo();
    const steps: readonly [number, string][] = [
      [200, "lines=200 code-review=high correctness-review=1"],
      [1, "lines=201 code-review=high correctness-review=3"],
      [99, "lines=300 code-review=high correctness-review=3"],
      [1, "lines=301 code-review=xhigh correctness-review=3"],
      [899, "lines=1200 code-review=xhigh correctness-review=3"],
      [1, "lines=1201 code-review=xhigh correctness-review=4"],
      [1799, "lines=3000 code-review=xhigh correctness-review=4"],
      [1, "lines=3001 code-review=max correctness-review=4"],
    ];

    steps.forEach(([count, expected], i) => {
      write(cwd, `app/Step${i}.php`, lines(count));
      commit(cwd);

      expect(run(cwd, "main", "feature").stdout).toBe(expected);
    });
  });

  it("ignores commits on the base after the merge base", () => {
    const cwd = makeRepo();
    write(cwd, "app/New.php", lines(4));
    commit(cwd);
    git(cwd, "checkout", "-q", "main");
    write(cwd, "app/Other.php", lines(4000));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe(
      "lines=4 code-review=high correctness-review=1",
    );
  });

  it("sizes the whole repository when run from a subdirectory", () => {
    const cwd = makeRepo();
    write(cwd, "app/New.php", lines(4));
    write(cwd, "docs/Guide.md", lines(6));
    commit(cwd);

    expect(run(join(cwd, "app"), "main", "feature").stdout).toBe(
      "lines=10 code-review=high correctness-review=1",
    );
  });

  it("exits 2 when a ref is not a commit", () => {
    const cwd = makeRepo();
    const result = run(cwd, "main", "missing");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing is not a commit");
  });

  it("exits 2 without two refs", () => {
    const result = run(makeRepo(), "main");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage:");
  });
});
