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

    expect(run(cwd, "main", "feature").stdout).toBe("lines=9 large=no");
  });

  it("leaves out lockfiles at any depth", () => {
    const cwd = makeRepo();
    write(cwd, "composer.lock", lines(3000));
    write(cwd, "web/yarn.lock", lines(3000));
    write(cwd, "package-lock.json", lines(3000));
    write(cwd, "site/package-lock.json", lines(3000));
    write(cwd, "npm-shrinkwrap.json", lines(3000));
    write(cwd, "web/pnpm-lock.yaml", lines(3000));
    write(cwd, "tools/go.sum", lines(3000));
    write(cwd, "app/New.php", lines(5));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe("lines=5 large=no");
  });

  it("counts a binary file as zero", () => {
    const cwd = makeRepo();
    write(cwd, "public/logo.png", Buffer.from([0, 1, 2, 0, 255, 0, 10, 0]));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe("lines=0 large=no");
  });

  it("counts a file moved without edits as zero", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "src"));
    renameSync(join(cwd, "app", "Thing.php"), join(cwd, "src", "Thing.php"));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe("lines=0 large=no");
  });

  it("counts only the edited lines of a moved file", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "src"));
    write(cwd, "src/Thing.php", lines(40).replace("line 3\n", "edited\n"));
    git(cwd, "rm", "-q", "app/Thing.php");
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe("lines=2 large=no");
  });

  it("detects moves when the clone turns rename detection off", () => {
    const cwd = makeRepo();
    git(cwd, "config", "diff.renames", "false");
    mkdirSync(join(cwd, "src"));
    renameSync(join(cwd, "app", "Thing.php"), join(cwd, "src", "Thing.php"));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe("lines=0 large=no");
  });

  it("is not large at 2500 lines and is large at 2501", () => {
    const cwd = makeRepo();
    write(cwd, "app/Big.php", lines(2500));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe("lines=2500 large=no");

    write(cwd, "app/More.php", lines(1));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe("lines=2501 large=yes");
  });

  it("ignores commits on the base after the merge base", () => {
    const cwd = makeRepo();
    write(cwd, "app/New.php", lines(4));
    commit(cwd);
    git(cwd, "checkout", "-q", "main");
    write(cwd, "app/Other.php", lines(3000));
    commit(cwd);

    expect(run(cwd, "main", "feature").stdout).toBe("lines=4 large=no");
  });

  it("sizes the whole repository when run from a subdirectory", () => {
    const cwd = makeRepo();
    write(cwd, "app/New.php", lines(4));
    write(cwd, "docs/Guide.md", lines(6));
    commit(cwd);

    expect(run(join(cwd, "app"), "main", "feature").stdout).toBe(
      "lines=10 large=no",
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
