import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { makeSandbox, realGit as realGitPath } from "./review-test-git.ts";

const script = join(
  import.meta.dirname,
  "..",
  "review",
  "skills",
  "pr-review",
  "scripts",
  "head-setup.mjs",
);

type Json = Record<string, unknown>;
type Files = Record<string, string>;
type Fixture = { dir: string; base: string; head: string };
type Outcome = { status: number | null; json: Json; stderr: string };
type CommitOptions = { links?: Files; executable?: string[] };

const sandboxRoot = makeSandbox("review-head-setup-");
const sandbox = sandboxRoot.root;
let scratch = join(sandbox, "scratch");
const realGit = realGitPath;
let counter = 0;

beforeEach(() => {
  scratch = nextPath("scratch");
  mkdirSync(scratch);
});

afterAll(() => {
  sandboxRoot.dispose();
});

function nextPath(label: string): string {
  counter += 1;

  return join(sandbox, `${label}-${counter}`);
}

function tryGit(
  cwd: string,
  ...args: string[]
): { status: number | null; stdout: string; stderr: string } {
  return sandboxRoot.tryGit(cwd, ...args);
}

function git(cwd: string, ...args: string[]): string {
  return sandboxRoot.git(cwd, ...args);
}

function write(cwd: string, path: string, content: string): void {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

function commit(
  cwd: string,
  files: Files,
  { links = {}, executable = [] }: CommitOptions = {},
): string {
  for (const [path, content] of Object.entries(files)) {
    write(cwd, path, content);
  }

  for (const path of executable) {
    chmodSync(join(cwd, path), 0o755);
  }

  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    symlinkSync(target, join(cwd, path));
  }

  git(cwd, "add", "-f", "-A");
  git(cwd, "commit", "-q", "--allow-empty", "-m", "change");

  return git(cwd, "rev-parse", "HEAD");
}

function makeRepo(files: Files = {}, options: CommitOptions = {}): string {
  const dir = nextPath("repo");

  mkdirSync(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  commit(dir, { "notes.txt": "x\n", ...files }, options);

  return dir;
}

function makeHead(
  dir: string,
  files: Files,
  options: CommitOptions & { from?: string } = {},
): string {
  counter += 1;

  const branch = `pr-${counter}`;
  const original = git(dir, "rev-parse", "--abbrev-ref", "HEAD");

  git(dir, "switch", "-q", "-c", branch, options.from ?? original);

  const sha = commit(dir, files, options);

  git(dir, "switch", "-q", original);

  return sha;
}

function makeFixture(
  base: Files,
  head: Files,
  options: CommitOptions = {},
): Fixture {
  const dir = makeRepo(base);
  const baseSha = git(dir, "rev-parse", "HEAD");

  return { dir, base: baseSha, head: makeHead(dir, head, options) };
}

function makeBin(wrapper?: string): string {
  const bin = mkdtempSync(join(sandbox, "bin-"));

  if (wrapper === undefined) {
    symlinkSync(realGit, join(bin, "git"));
  } else {
    writeFileSync(join(bin, "git"), wrapper.replaceAll("REAL_GIT", realGit));
    chmodSync(join(bin, "git"), 0o755);
  }

  return bin;
}

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function run(
  cwd: string,
  args: string[],
  bin: string = makeBin(),
  env: Record<string, string> = {},
): Outcome {
  sandboxRoot.assertInside(cwd);

  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: sandboxRoot.env({ PATH: bin, TMPDIR: scratch, ...env }),
  });
  const parsed: unknown = JSON.parse(result.stdout);

  if (!isJson(parsed)) {
    throw new Error(`head-setup printed ${result.stdout}`);
  }

  return { status: result.status, json: parsed, stderr: result.stderr };
}

function switchCommand(dir: string, name: string): string {
  return `git -c core.hooksPath=/dev/null -c submodule.recurse=false -C ${dir} switch --no-overwrite-ignore ${name}`;
}

function runShell(command: string, cwd: string): void {
  sandboxRoot.assertInside(cwd);
  spawnSync("sh", ["-c", command], {
    cwd,
    encoding: "utf8",
    env: sandboxRoot.env(),
  });
}

function runPrinted(command: string, dir: string): void {
  expect(command).toContain(` -C ${dir} `);
  runShell(command, dir);
}

function listAt(json: Json, key: string): Json[] {
  const value = json[key];

  if (!Array.isArray(value)) {
    throw new Error(`${key} is not a list`);
  }

  return value.filter(isJson);
}

function headsOf(outcome: Outcome): Json[] {
  return listAt(outcome.json, "heads");
}

function plan(dir: string, ...shas: string[]): Json {
  const outcome = run(dir, ["plan", ...shas]);

  if (outcome.status !== 0) {
    throw new Error(`plan failed: ${JSON.stringify(outcome.json)}`);
  }

  return outcome.json;
}

function enter(dir: string, kind: string, sha: string): Outcome {
  return run(dir, ["enter", kind, sha]);
}

function gitDirOf(dir: string): string {
  return git(dir, "rev-parse", "--absolute-git-dir");
}

function recordPath(dir: string): string {
  return join(gitDirOf(dir), "pr-review-setup.json");
}

function readRecord(dir: string): { entries: Json[] } {
  const parsed: unknown = JSON.parse(readFileSync(recordPath(dir), "utf8"));

  if (!isJson(parsed) || !Array.isArray(parsed.entries)) {
    throw new Error("unexpected record");
  }

  return { entries: parsed.entries.filter(isJson) };
}

function writeRecord(dir: string, value: unknown): void {
  writeFileSync(recordPath(dir), JSON.stringify(value));
}

function headOf(dir: string): string {
  return git(dir, "rev-parse", "HEAD");
}

function branchOf(dir: string): string {
  return tryGit(
    dir,
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ).stdout.trim();
}

function pathOf(outcome: Outcome): string {
  const path = outcome.json.path;

  if (typeof path !== "string") {
    throw new Error("no path in the output");
  }

  return path;
}

function scratchEntries(): string[] {
  return readdirSync(scratch);
}

describe("head-setup.mjs", () => {
  describe("plan", () => {
    it("reads the tree without writing anything", () => {
      const { dir, base, head } = makeFixture({}, { "b.txt": "b\n" });
      const json = plan(dir, head);

      expect(json).toMatchObject({
        ok: true,
        treeSha: base,
        branch: "main",
        clean: true,
        checkout: { offered: true, reason: null },
        record: null,
      });
      expect(headsOf({ status: 0, json, stderr: "" })).toEqual([
        { headSha: head, atTree: false, lockfiles: [], sessionConfig: [] },
      ]);
      expect(existsSync(recordPath(dir))).toBe(false);
      expect(existsSync(join(gitDirOf(dir), "index.lock"))).toBe(false);
    });

    it("reports a dirty tree, a detached head and atTree", () => {
      const { dir, base, head } = makeFixture({}, { "b.txt": "b\n" });

      write(dir, "stray.txt", "x\n");
      git(dir, "switch", "-q", "--detach", "main");

      const json = plan(dir, head, base);

      expect(json).toMatchObject({
        branch: null,
        clean: false,
        checkout: { offered: false, reason: "dirty" },
      });
      expect(
        headsOf({ status: 0, json, stderr: "" }).map((h) => h.atTree),
      ).toEqual([false, true]);
    });

    it("reports a recorded check-out", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      expect(enter(dir, "checkout", head).status).toBe(0);

      const json = plan(dir, head);

      expect(json).toMatchObject({
        checkout: { offered: false, reason: "recorded" },
      });
      expect(isJson(json.record)).toBe(true);
    });

    it("refuses a missing or unknown sha", () => {
      const { dir } = makeFixture({}, { "b.txt": "b\n" });

      expect(run(dir, ["plan"]).json).toMatchObject({ reason: "usage" });
      expect(run(dir, ["plan", "abc"]).json).toMatchObject({
        reason: "bad-sha",
      });
      expect(run(dir, ["plan", "0".repeat(40)]).json).toMatchObject({
        reason: "bad-sha",
      });
    });

    it("works from a subdirectory and checks dependencies at the top", () => {
      const { dir, head } = makeFixture(
        { "package-lock.json": "1\n" },
        { "package-lock.json": "2\n" },
      );

      mkdirSync(join(dir, "src", "deep"), { recursive: true });
      mkdirSync(join(dir, "node_modules"));

      const outcome = run(join(dir, "src", "deep"), ["plan", head]);

      expect(outcome.status).toBe(0);
      expect(headsOf(outcome)[0]?.lockfiles).toEqual([
        {
          path: "package-lock.json",
          manager: "npm",
          changed: true,
          dependencies: "present",
        },
      ]);
    });

    it("fails cleanly outside a repository", () => {
      const dir = nextPath("plain");

      mkdirSync(dir);

      const outcome = run(dir, ["plan", "0".repeat(40)]);

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({
        ok: false,
        reason: "not-a-repository",
      });
    });
  });

  describe("plan lockfiles", () => {
    const managers: [string, string, string, string][] = [
      ["composer", "composer.lock", "vendor", "dir"],
      ["npm", "package-lock.json", "node_modules", "dir"],
      ["pnpm", "pnpm-lock.yaml", "node_modules", "dir"],
      ["yarn", "yarn.lock", "node_modules", "dir"],
      ["yarn", "yarn.lock", ".pnp.cjs", "file"],
      ["bun", "bun.lock", "node_modules", "dir"],
      ["bun", "bun.lockb", "node_modules", "dir"],
      ["uv", "uv.lock", ".venv", "dir"],
      ["poetry", "poetry.lock", ".venv", "dir"],
    ];

    it.each(managers)(
      "reports a changed %s lockfile (%s) and its %s",
      (manager, lockfile, dependency, shape) => {
        const { dir, head } = makeFixture(
          { [lockfile]: "1\n" },
          { [lockfile]: "2\n" },
        );
        const read = (): Json | undefined =>
          headsOf({
            status: 0,
            json: plan(dir, head),
            stderr: "",
          })[0];

        expect(read()?.lockfiles).toEqual([
          { path: lockfile, manager, changed: true, dependencies: "missing" },
        ]);

        if (shape === "dir") {
          mkdirSync(join(dir, dependency));
        } else {
          write(dir, dependency, "x\n");
        }

        expect(read()?.lockfiles).toEqual([
          { path: lockfile, manager, changed: true, dependencies: "present" },
        ]);
      },
    );

    it.each([
      ["bundler", "Gemfile.lock"],
      ["go", "go.sum"],
    ])("never claims to know the %s dependencies", (manager, lockfile) => {
      const { dir, head } = makeFixture(
        { [lockfile]: "1\n" },
        { [lockfile]: "2\n" },
      );

      expect(
        headsOf({ status: 0, json: plan(dir, head), stderr: "" })[0]?.lockfiles,
      ).toEqual([
        { path: lockfile, manager, changed: true, dependencies: "unknown" },
      ]);
    });

    it("marks a lockfile unchanged, or new when the current commit has none", () => {
      const { dir, head } = makeFixture(
        { "package-lock.json": "1\n" },
        { "b.txt": "b\n", "composer.lock": "{}\n" },
      );
      const lockfiles = headsOf({
        status: 0,
        json: plan(dir, head),
        stderr: "",
      })[0]?.lockfiles;

      expect(lockfiles).toEqual([
        {
          path: "composer.lock",
          manager: "composer",
          changed: true,
          dependencies: "missing",
        },
        {
          path: "package-lock.json",
          manager: "npm",
          changed: false,
          dependencies: "missing",
        },
      ]);
    });

    it("checks the directory next to a nested lockfile", () => {
      const { dir, head } = makeFixture(
        { "web/package-lock.json": "1\n" },
        { "web/package-lock.json": "2\n" },
      );

      mkdirSync(join(dir, "node_modules"));

      const first = headsOf({ status: 0, json: plan(dir, head), stderr: "" })[0]
        ?.lockfiles;

      mkdirSync(join(dir, "web", "node_modules"));

      const second = headsOf({
        status: 0,
        json: plan(dir, head),
        stderr: "",
      })[0]?.lockfiles;

      expect(first).toMatchObject([{ dependencies: "missing" }]);
      expect(second).toMatchObject([{ dependencies: "present" }]);
    });

    it("does not list a symlinked or unsafe lockfile path", () => {
      const { dir, head } = makeFixture(
        {},
        {
          "pnpm-lock.yaml": "x\n",
          "we$ird/composer.lock": "x\n",
          "-dash/yarn.lock": "x\n",
        },
        { links: { "package-lock.json": "pnpm-lock.yaml" } },
      );
      const lockfiles = headsOf({
        status: 0,
        json: plan(dir, head),
        stderr: "",
      })[0]?.lockfiles;

      expect(lockfiles).toMatchObject([{ path: "pnpm-lock.yaml" }]);
      expect(lockfiles).toHaveLength(1);
    });

    it("finds nested session config even when the pathspec environment is set", () => {
      const { dir, head } = makeFixture(
        { "app/.claude/settings.json": "1\n", "app/.mcp.json": "1\n" },
        {
          "app/.claude/settings.json": "2\n",
          "app/.mcp.json": "2\n",
          ".claude/root.md": "r\n",
          "app/other.txt": "o\n",
        },
      );
      const expected = [
        ".claude/root.md",
        "app/.claude/settings.json",
        "app/.mcp.json",
      ];

      for (const env of [
        {},
        { GIT_LITERAL_PATHSPECS: "1" },
        { GIT_NOGLOB_PATHSPECS: "1" },
      ]) {
        const outcome = run(dir, ["plan", head], makeBin(), env);

        expect(headsOf(outcome)[0]?.sessionConfig).toEqual(expected);
      }
    });

    it("lists opencode.json, opencode.jsonc and .opencode at any depth", () => {
      const { dir, head } = makeFixture(
        {},
        {
          "opencode.json": "1\n",
          "opencode.jsonc": "1\n",
          ".opencode/plugin.ts": "1\n",
          "app/opencode.json": "1\n",
          "app/opencode.jsonc": "1\n",
          "app/.opencode/agent/a.md": "1\n",
          "app/notopencode.json": "1\n",
          "other.txt": "1\n",
        },
      );

      expect(
        headsOf({ status: 0, json: plan(dir, head), stderr: "" })[0]
          ?.sessionConfig,
      ).toEqual([
        ".opencode/plugin.ts",
        "app/.opencode/agent/a.md",
        "app/opencode.json",
        "app/opencode.jsonc",
        "opencode.json",
        "opencode.jsonc",
      ]);
    });

    it("diffs session config against the current commit, not the base", () => {
      const dir = makeRepo({
        ".claude/a.md": "1\n",
        ".mcp.json": "{}\n",
        "x.txt": "1\n",
      });
      const first = headOf(dir);
      const head = makeHead(
        dir,
        { ".claude/new.md": "n\n", ".mcp.json": '{"a":1}\n', "x.txt": "2\n" },
        { from: first },
      );

      commit(dir, { ".claude/a.md": "2\n" });

      expect(
        headsOf({ status: 0, json: plan(dir, head), stderr: "" })[0]
          ?.sessionConfig,
      ).toEqual([".claude/a.md", ".claude/new.md", ".mcp.json"]);
    });
  });

  describe("enter checkout and restore", () => {
    it("switches to the head, records the branch and switches back", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const entered = enter(dir, "checkout", head);

      expect(entered.status).toBe(0);
      expect(entered.json).toMatchObject({
        ok: true,
        kind: "checkout",
        headSha: head,
        from: "main",
      });
      expect(headOf(dir)).toBe(head);
      expect(branchOf(dir)).toBe("");
      expect(readRecord(dir).entries).toMatchObject([
        { kind: "checkout", headSha: head, branch: "main" },
      ]);
      expect(
        readdirSync(gitDirOf(dir)).filter((name) => name.endsWith(".tmp")),
      ).toEqual([]);

      const restored = run(dir, ["restore"]);

      expect(restored.status).toBe(0);
      expect(restored.json).toMatchObject({
        ok: true,
        declined: [],
        changedLockfiles: [],
      });
      expect(listAt(restored.json, "restored")).toHaveLength(1);
      expect(branchOf(dir)).toBe("main");
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    it("works from a subdirectory", () => {
      const { dir, head } = makeFixture(
        { "src/a.txt": "a\n" },
        { "b.txt": "b\n" },
      );
      const sub = join(dir, "src");

      expect(enter(sub, "checkout", head).status).toBe(0);
      expect(run(sub, ["restore"]).status).toBe(0);
      expect(branchOf(dir)).toBe("main");
    });

    it("returns to a detached start by sha", () => {
      const { dir, base, head } = makeFixture({}, { "b.txt": "b\n" });

      git(dir, "switch", "-q", "--detach", "main");

      const entered = enter(dir, "checkout", head);

      expect(entered.json).toMatchObject({ from: base });
      expect(run(dir, ["restore"]).status).toBe(0);
      expect(headOf(dir)).toBe(base);
      expect(branchOf(dir)).toBe("");
    });

    it("refuses a dirty tree", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      write(dir, "notes.txt", "changed\n");

      const tracked = enter(dir, "checkout", head);

      expect(tracked.status).toBe(1);
      expect(tracked.json).toMatchObject({
        ok: false,
        reason: "dirty",
        dirtyPaths: ["notes.txt"],
      });

      git(dir, "checkout", "--", "notes.txt");
      write(dir, "stray.txt", "x\n");

      expect(enter(dir, "checkout", head).json).toMatchObject({
        reason: "dirty",
      });
      expect(branchOf(dir)).toBe("main");
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    it("refuses when already at the head, and bad input", () => {
      const { dir, base, head } = makeFixture({}, { "b.txt": "b\n" });

      expect(enter(dir, "checkout", base).json).toMatchObject({
        reason: "at-head",
      });
      expect(enter(dir, "checkout", "nope").json).toMatchObject({
        reason: "bad-sha",
      });
      expect(enter(dir, "checkout", "f".repeat(40)).json).toMatchObject({
        reason: "bad-sha",
      });
      expect(enter(dir, "sideways", head).json).toMatchObject({
        reason: "usage",
      });
      expect(run(dir, ["fly"]).json).toMatchObject({ reason: "usage" });
      expect(run(dir, []).status).toBe(1);
    });

    it("refuses a second check-out in the same tree but not in another linked worktree", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const other = makeHead(dir, { "c.txt": "c\n" });
      const linked = nextPath("linked");

      git(dir, "worktree", "add", "-q", "-b", "side", linked, "main");

      expect(enter(dir, "checkout", head).status).toBe(0);
      expect(enter(dir, "checkout", other).json).toMatchObject({
        ok: false,
        reason: "already-recorded",
      });

      const second = enter(linked, "checkout", other);

      expect(second.status).toBe(0);
      expect(headOf(linked)).toBe(other);
      expect(headOf(dir)).toBe(head);
    });

    it("keeps one record per linked worktree and removes it with the worktree", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const linked = nextPath("linked");

      git(dir, "worktree", "add", "-q", "-b", "side", linked, "main");
      enter(dir, "checkout", head);
      enter(linked, "checkout", head);

      const linkedRecord = recordPath(linked);

      expect(linkedRecord).not.toBe(recordPath(dir));
      expect(dirname(linkedRecord)).toContain(join(".git", "worktrees"));
      expect(existsSync(join(dir, ".git", "pr-review-setup.json"))).toBe(true);
      expect(readRecord(dir).entries).toHaveLength(1);
      expect(readRecord(linked).entries).toHaveLength(1);

      git(dir, "worktree", "remove", "--force", linked);

      expect(existsSync(linkedRecord)).toBe(false);
      expect(readRecord(dir).entries).toHaveLength(1);
    });

    it("refuses a merge in progress and leaves no record", () => {
      const dir = makeRepo({ "a.txt": "1\n" });
      const head = makeHead(dir, { "b.txt": "b\n" });

      git(dir, "switch", "-q", "-c", "side");
      commit(dir, { "a.txt": "side\n" });
      git(dir, "switch", "-q", "main");
      commit(dir, { "a.txt": "main\n" });
      tryGit(dir, "merge", "side");

      const conflicted = enter(dir, "checkout", head);

      expect(conflicted.status).toBe(1);
      expect(conflicted.json).toMatchObject({ ok: false });
      expect(existsSync(recordPath(dir))).toBe(false);
      expect(branchOf(dir)).toBe("main");
    });

    it("refuses a merge in progress that left the tree clean", () => {
      const dir = makeRepo({ "a.txt": "1\n" });
      const head = makeHead(dir, { "b.txt": "b\n" });

      git(dir, "switch", "-q", "-c", "side");
      commit(dir, { "c.txt": "side\n" });
      git(dir, "switch", "-q", "main");
      git(dir, "merge", "--no-commit", "--no-ff", "side");
      git(dir, "reset", "-q", "--hard", "HEAD");
      writeFileSync(join(gitDirOf(dir), "MERGE_HEAD"), `${headOf(dir)}\n`);

      expect(enter(dir, "checkout", head).json).toMatchObject({
        reason: "operation-in-progress",
      });
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    const ignoredShapes: [string, Files, Files, string, string][] = [
      [
        "an ignored file",
        { cache: "tracked\n" },
        { cache: "mine\n" },
        "cache",
        "mine\n",
      ],
      [
        "an ignored directory",
        { build: "tracked\n" },
        { "build/f": "mine\n" },
        "build/f",
        "mine\n",
      ],
      [
        "an ignored file under a tracked directory",
        { "out/x": "tracked\n" },
        { out: "mine\n" },
        "out",
        "mine\n",
      ],
    ];

    it.each(ignoredShapes)(
      "keeps %s the head would overwrite",
      (_name, headFiles, ignored, kept, content) => {
        const { dir, head } = makeFixture(
          { ".gitignore": "cache\nbuild\nout\n" },
          headFiles,
        );

        for (const [path, text] of Object.entries(ignored)) {
          write(dir, path, text);
        }

        const outcome = enter(dir, "checkout", head);

        expect(outcome.status).toBe(1);
        expect(outcome.json).toMatchObject({
          ok: false,
          reason: "switch-failed",
        });
        expect(readFileSync(join(dir, kept), "utf8")).toBe(content);
        expect(branchOf(dir)).toBe("main");
        expect(existsSync(recordPath(dir))).toBe(false);
      },
    );

    const dirtyingWrapper = (back: string): string =>
      `#!/bin/sh\ncase "$*" in\n*"switch --detach --no-overwrite-ignore"*) REAL_GIT "$@"; code=$?; echo dirt >> notes.txt; exit $code;;\n${back}esac\nexec REAL_GIT "$@"\n`;

    it("switches back at once when the head leaves the tree changed", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const outcome = run(
        dir,
        ["enter", "checkout", head],
        makeBin(dirtyingWrapper("")),
      );

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({
        reason: "dirty-after-switch",
        dirtyPaths: ["notes.txt"],
      });
      expect(branchOf(dir)).toBe("main");
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    it("keeps the record and says so when it cannot switch back", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const failing = `*"switch --no-overwrite-ignore main"*) echo "boom" >&2; exit 1;;\n`;
      const outcome = run(
        dir,
        ["enter", "checkout", head],
        makeBin(dirtyingWrapper(failing)),
      );

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({ reason: "switch-back-failed" });
      expect(String(outcome.json.detail)).toContain("boom");
      expect(String(outcome.json.detail)).toContain(switchCommand(dir, "main"));
      expect(headOf(dir)).toBe(head);
      expect(readRecord(dir).entries).toHaveLength(1);
    });

    it("moves a submodule the PR changed and still restores", () => {
      const sub = makeRepo({ "s.txt": "A\n" });
      const subA = headOf(sub);
      const subB = commit(sub, { "s.txt": "B\n" });
      const dir = makeRepo({});

      git(
        dir,
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        "-q",
        sub,
        "sub",
      );
      git(dir, "-C", "sub", "checkout", "-q", subA);
      git(dir, "add", "sub");
      git(dir, "commit", "-q", "-m", "submodule");

      const head = makeHead(dir, {});

      git(dir, "config", "submodule.recurse", "true");
      git(dir, "switch", "-q", "-c", "moved");
      git(dir, "update-index", "--cacheinfo", `160000,${subB},sub`);
      git(dir, "commit", "-q", "-m", "move");

      const moved = headOf(dir);

      git(dir, "switch", "-q", "main");

      expect(head).not.toBe(moved);
      expect(enter(dir, "checkout", moved).status).toBe(0);
      expect(tryGit(dir, "status", "--porcelain").stdout).toContain("sub");

      const restored = run(dir, ["restore"]);

      expect(restored.status).toBe(0);
      expect(branchOf(dir)).toBe("main");
    });

    it("never runs a tracked hook, on the switch or on the way back", () => {
      const log = nextPath("hook-log");
      const dir = makeRepo(
        { ".githooks/post-checkout": `#!/bin/sh\necho ran >> ${log}\n` },
        { executable: [".githooks/post-checkout"] },
      );
      const head = makeHead(dir, { "b.txt": "b\n" });

      git(dir, "config", "core.hooksPath", ".githooks");

      const control = tryGit(dir, "switch", "-q", "--detach", head);

      expect(control.status).toBe(0);
      expect(existsSync(log)).toBe(true);

      git(dir, "switch", "-q", "main");
      rmSync(log);

      const wt = nextPath("control-worktree");

      git(dir, "worktree", "add", "-q", "--detach", wt, head);
      expect(existsSync(log)).toBe(true);
      git(dir, "worktree", "remove", "--force", wt);
      rmSync(log);

      const newHead = makeHead(dir, { "c.txt": "c\n" });

      rmSync(log, { force: true });

      expect(enter(dir, "checkout", newHead).status).toBe(0);
      expect(run(dir, ["restore"]).status).toBe(0);
      expect(enter(dir, "worktree", newHead).status).toBe(0);
      expect(existsSync(log)).toBe(false);
    });

    it("declines when a commit was made on the detached head", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);
      git(dir, "commit", "-q", "--allow-empty", "-m", "mine");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({ ok: false, reason: "declined" });
      expect(listAt(outcome.json, "declined")).toMatchObject([
        {
          kind: "checkout",
          reason: "head-moved",
          command: expect.stringContaining(switchCommand(dir, "main")),
        },
      ]);
      expect(readRecord(dir).entries).toHaveLength(1);
      expect(branchOf(dir)).toBe("");
    });

    it("prints a switch command that cannot overwrite an ignored file", () => {
      const dir = makeRepo({ "keep.env": "tracked\n" });

      git(dir, "switch", "-q", "-c", "drop");
      git(dir, "rm", "-q", "keep.env");
      commit(dir, { ".gitignore": "keep.env\n" });

      const head = headOf(dir);

      git(dir, "switch", "-q", "main");
      enter(dir, "checkout", head);
      write(dir, "keep.env", "mine\n");

      const outcome = run(dir, ["restore"]);
      const declined = listAt(outcome.json, "declined");

      expect(declined).toMatchObject([{ reason: "switch-failed" }]);

      runPrinted(String(declined[0]?.command), dir);

      expect(readFileSync(join(dir, "keep.env"), "utf8")).toBe("mine\n");
      expect(headOf(dir)).toBe(head);
    });

    it("prints a head-moved command that keeps the commits first", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);

      const mine = commit(dir, { "mine.txt": "m\n" });
      const declined = listAt(run(dir, ["restore"]).json, "declined");

      runPrinted(String(declined[0]?.command), dir);

      const kept = `pr-review-kept-${mine.slice(0, 12)}`;

      expect(git(dir, "rev-parse", kept)).toBe(mine);
      expect(branchOf(dir)).toBe("main");
    });

    it("declines with the dirty paths when the tree changed", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);
      write(dir, "b.txt", "edited\n");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "dirty", dirtyPaths: ["b.txt"] },
      ]);
      expect(readRecord(dir).entries).toHaveLength(1);
    });

    it("declines when the user is on another branch", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);
      git(dir, "switch", "-q", "-c", "elsewhere");

      expect(listAt(run(dir, ["restore"]).json, "declined")).toMatchObject([
        { reason: "not-detached" },
      ]);
    });

    it("declines with the command when the branch is taken by another worktree", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const taker = nextPath("taker");

      enter(dir, "checkout", head);
      git(dir, "worktree", "add", "-q", taker, "main");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "switch-failed", command: switchCommand(dir, "main") },
      ]);
      expect(headOf(dir)).toBe(head);

      git(dir, "worktree", "remove", "--force", taker);

      expect(run(dir, ["restore"]).status).toBe(0);
      expect(branchOf(dir)).toBe("main");
    });

    it("drops the entry when the user already switched back", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);
      git(dir, "switch", "-q", "main");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(0);
      expect(listAt(outcome.json, "restored")).toMatchObject([
        { alreadyBack: true },
      ]);
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    it("quotes branch names with shell characters in the printed command", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const name = "feat/x;touch$IFS'y'";

      git(dir, "switch", "-q", "-c", name);
      enter(dir, "checkout", head);
      git(dir, "commit", "-q", "--allow-empty", "-m", "mine");

      const declined = listAt(run(dir, ["restore"]).json, "declined");

      const command = String(declined[0]?.command);
      const quoted = String.raw`'feat/x;touch$IFS'\''y'\'''`;

      expect(command).toContain(" && git ");
      expect(command.endsWith(switchCommand(dir, quoted))).toBe(true);
    });

    it("lists the lockfiles that differ between the head and where it returned", () => {
      const { dir, head } = makeFixture(
        { "package-lock.json": "1\n", "composer.lock": "1\n" },
        { "package-lock.json": "2\n" },
      );

      enter(dir, "checkout", head);

      expect(run(dir, ["restore"]).json.changedLockfiles).toEqual([
        { path: "package-lock.json", manager: "npm" },
      ]);
    });

    it("restores nothing when there is no record", () => {
      const { dir } = makeFixture({}, { "b.txt": "b\n" });

      expect(run(dir, ["restore"]).json).toEqual({
        ok: true,
        recorded: 0,
        restored: [],
        declined: [],
        changedLockfiles: [],
      });
    });
  });

  describe("enter worktree", () => {
    it("creates a detached worktree at the head and removes it with its install", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const entered = enter(dir, "worktree", head);
      const path = pathOf(entered);

      expect(entered.status).toBe(0);
      expect(entered.json).toMatchObject({ kind: "worktree", headSha: head });
      expect(path).toMatch(/pr-review-[^/]+\/head$/);
      expect(path.startsWith(scratch)).toBe(true);
      expect(headOf(path)).toBe(head);
      expect(git(dir, "worktree", "list", "--porcelain")).toContain(path);

      write(path, "node_modules/pkg/index.js", "x\n");
      write(path, ".venv/bin/python", "x\n");
      write(path, "untracked.txt", "x\n");

      const restored = run(dir, ["restore"]);

      expect(restored.status).toBe(0);
      expect(existsSync(path)).toBe(false);
      expect(
        scratchEntries().filter((name) => name.startsWith("pr-review-")),
      ).toEqual([]);
      expect(git(dir, "worktree", "list", "--porcelain")).not.toContain(path);
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    it("drops the entry when the worktree is already gone", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const path = pathOf(enter(dir, "worktree", head));

      git(dir, "worktree", "remove", "--force", path);

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(0);
      expect(listAt(outcome.json, "restored")).toMatchObject([
        { missing: true },
      ]);
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    it("declines a recorded path that is not a worktree of this repository", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const path = pathOf(enter(dir, "worktree", head));
      const victim = join(sandbox, "pr-review-victim");

      mkdirSync(join(victim, "head"), { recursive: true });
      write(join(victim, "head"), "keep.txt", "x\n");

      const record = readRecord(dir);

      writeRecord(dir, {
        version: 1,
        entries: [
          {
            ...record.entries[0],
            path: join(victim, "head"),
            parent: victim,
            root: sandbox,
          },
        ],
      });

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "not-a-worktree" },
      ]);
      expect(existsSync(join(victim, "head", "keep.txt"))).toBe(true);
      expect(existsSync(path)).toBe(true);
    });
  });

  describe("enter clone", () => {
    function makeSource(): Fixture {
      const fixture = makeFixture({}, { "b.txt": "b\n" });

      git(
        fixture.dir,
        "remote",
        "add",
        "origin",
        "https://example.com/org/repo.git",
      );

      return fixture;
    }

    it("clones at the head with the source's origin URL", () => {
      const { dir, head } = makeSource();
      const entered = enter(dir, "clone", head);
      const path = pathOf(entered);

      expect(entered.status).toBe(0);
      expect(entered.json).toMatchObject({
        kind: "clone",
        headSha: head,
        originRefsAreLocal: true,
      });
      expect(headOf(path)).toBe(head);
      expect(branchOf(path)).toBe("");
      expect(git(path, "config", "--get", "remote.origin.url")).toBe(
        "https://example.com/org/repo.git",
      );
      expect(existsSync(join(path, "b.txt"))).toBe(true);
    });

    it("leaves the source repository's config and hooks alone when an install writes .git", () => {
      const { dir, head } = makeSource();
      const sourceGit = join(dir, ".git");
      const before = [
        readFileSync(join(sourceGit, "config"), "utf8"),
        readdirSync(join(sourceGit, "hooks")).sort().join(","),
      ];
      const path = pathOf(enter(dir, "clone", head));

      git(path, "config", "core.hooksPath", "/tmp/evil");
      git(path, "config", "install.wrote", "yes");
      writeFileSync(
        join(path, ".git", "hooks", "post-checkout"),
        "#!/bin/sh\n",
      );

      expect([
        readFileSync(join(sourceGit, "config"), "utf8"),
        readdirSync(join(sourceGit, "hooks")).sort().join(","),
      ]).toEqual(before);
      expect(branchOf(dir)).toBe("main");
    });

    it("deletes the clone and its scratch directory on restore", () => {
      const { dir, head } = makeSource();
      const path = pathOf(enter(dir, "clone", head));

      write(path, "node_modules/x/y.js", "x\n");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(0);
      expect(existsSync(path)).toBe(false);
      expect(
        scratchEntries().filter((name) => name.startsWith("pr-review-")),
      ).toEqual([]);
    });

    it("refuses to delete a pr-review directory without the marker, even with a matching root", () => {
      const { dir, head } = makeSource();
      const parent = join(sandbox, "pr-review-victim-root");
      const path = join(parent, "head");

      mkdirSync(path, { recursive: true });
      write(path, "keep.txt", "x\n");
      writeRecord(dir, {
        version: 1,
        entries: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            kind: "clone",
            headSha: head,
            root: sandbox,
            path,
            parent,
          },
        ],
      });

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "not-ours" },
      ]);
      expect(existsSync(join(path, "keep.txt"))).toBe(true);
    });

    it("refuses to delete when the marker does not match", () => {
      const { dir, head } = makeSource();
      const path = pathOf(enter(dir, "clone", head));

      writeFileSync(join(dirname(path), ".pr-review-marker"), "someone-else");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "not-ours" },
      ]);
      expect(existsSync(path)).toBe(true);
    });

    it("refuses to delete when the clone path became a symlink", () => {
      const { dir, head } = makeSource();
      const path = pathOf(enter(dir, "clone", head));
      const victim = nextPath("victim");

      mkdirSync(victim);
      write(victim, "keep.txt", "x\n");
      rmSync(path, { recursive: true });
      symlinkSync(victim, path);

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "not-ours" },
      ]);
      expect(existsSync(join(victim, "keep.txt"))).toBe(true);
    });

    it("refuses to delete when the scratch directory became a symlink", () => {
      const { dir, head } = makeSource();
      const path = pathOf(enter(dir, "clone", head));
      const parent = dirname(path);
      const victim = nextPath("pr-review-victim");

      mkdirSync(join(victim, "head"), { recursive: true });
      write(join(victim, "head"), "keep.txt", "x\n");
      writeFileSync(
        join(victim, ".pr-review-marker"),
        String(readRecord(dir).entries[0]?.id),
      );
      rmSync(parent, { recursive: true });
      symlinkSync(victim, parent);

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(existsSync(join(victim, "head", "keep.txt"))).toBe(true);
    });
  });

  describe("--scratch and the recorded root", () => {
    function makeRoot(): string {
      const root = nextPath("custom");

      mkdirSync(root);

      return realpathSync(root);
    }

    it.each(["worktree", "clone"])(
      "puts a %s under the given root and restores it under another TMPDIR",
      (kind) => {
        const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
        const root = makeRoot();
        const entered = run(dir, ["enter", kind, head, "--scratch", root]);
        const path = pathOf(entered);

        expect(entered.status).toBe(0);
        expect(dirname(dirname(path))).toBe(root);
        expect(readRecord(dir).entries).toMatchObject([{ kind, root }]);

        const elsewhere = nextPath("other-tmp");

        mkdirSync(elsewhere);

        const restored = run(dir, ["restore"], makeBin(), {
          TMPDIR: elsewhere,
        });

        expect(restored.status).toBe(0);
        expect(existsSync(path)).toBe(false);
        expect(readdirSync(root)).toEqual([]);
      },
    );

    it("accepts the option before the sha", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const root = makeRoot();
      const entered = run(dir, ["enter", "worktree", "--scratch", root, head]);

      expect(entered.status).toBe(0);
      expect(dirname(dirname(pathOf(entered)))).toBe(root);
    });

    it("refuses a scratch directory that is not a plain absolute directory outside the repository", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const root = makeRoot();
      const link = nextPath("link");
      const file = nextPath("file");
      const inside = join(dir, "inside");
      const inGit = join(dir, ".git", "inside");

      symlinkSync(root, link);
      writeFileSync(file, "x");
      mkdirSync(inside);
      mkdirSync(inGit);

      const bad = [
        "relative",
        join("..", basename(root)),
        join(sandbox, "missing"),
        link,
        file,
        inside,
        inGit,
        dir,
        join(dir, ".git"),
        dirname(dir),
      ];

      for (const value of bad) {
        const outcome = run(dir, [
          "enter",
          "worktree",
          head,
          "--scratch",
          value,
        ]);

        expect(outcome.status).toBe(1);
        expect(outcome.json).toMatchObject({ reason: "bad-scratch" });
      }

      expect(
        run(dir, ["enter", "worktree", head, "--scratch"]).json,
      ).toMatchObject({
        reason: "bad-scratch",
      });
      expect(existsSync(recordPath(dir))).toBe(false);
      expect(readdirSync(root)).toEqual([]);
      expect(scratchEntries()).toEqual([]);
    });
  });

  describe("restore from the wrong directory", () => {
    it("reports how many entries it found", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const path = pathOf(enter(dir, "worktree", head));
      const wrong = run(path, ["restore"]);

      expect(wrong.status).toBe(0);
      expect(wrong.json).toMatchObject({ ok: true, recorded: 0 });
      expect(run(dir, ["restore"]).json).toMatchObject({ recorded: 1 });
    });
  });

  describe("the record file", () => {
    it("is replaced atomically by a later write", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "worktree", head);

      const before = statSync(recordPath(dir)).ino;

      enter(dir, "worktree", head);

      expect(statSync(recordPath(dir)).ino).not.toBe(before);
      expect(readRecord(dir).entries).toHaveLength(2);
    });

    it("keeps the previous record, and leaves no scratch, when a write fails", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "worktree", head);

      const before = readFileSync(recordPath(dir), "utf8");
      const gitDir = gitDirOf(dir);

      chmodSync(gitDir, 0o555);

      try {
        const outcome = enter(dir, "worktree", head);

        expect(outcome.status).toBe(1);
        expect(outcome.json).toMatchObject({ reason: "record-write-failed" });
      } finally {
        chmodSync(gitDir, 0o755);
      }

      expect(readFileSync(recordPath(dir), "utf8")).toBe(before);
      expect(
        scratchEntries().filter((name) => name.startsWith("pr-review-")),
      ).toHaveLength(1);
    });
  });

  describe("restore with ids", () => {
    function idOf(outcome: Outcome): string {
      const id = outcome.json.id;

      if (typeof id !== "string") {
        throw new Error("no id in the output");
      }

      return id;
    }

    it("prints the entry's id from every enter", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const worktree = enter(dir, "worktree", head);
      const clone = enter(dir, "clone", head);

      expect(readRecord(dir).entries.map((entry) => entry.id)).toEqual([
        idOf(worktree),
        idOf(clone),
      ]);
      expect(idOf(enter(dir, "checkout", head))).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("restores only the named entries and keeps the total in recorded", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const left = enter(dir, "worktree", head);
      const mine = enter(dir, "worktree", head);
      const outcome = run(dir, ["restore", idOf(mine)]);

      expect(outcome.status).toBe(0);
      expect(outcome.json).toMatchObject({ ok: true, recorded: 2 });
      expect(listAt(outcome.json, "restored")).toMatchObject([
        { id: idOf(mine) },
      ]);
      expect(existsSync(pathOf(mine))).toBe(false);
      expect(existsSync(pathOf(left))).toBe(true);
      expect(readRecord(dir).entries).toMatchObject([{ id: idOf(left) }]);
    });

    it("still restores everything without arguments", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const first = enter(dir, "worktree", head);
      const second = enter(dir, "worktree", head);

      expect(run(dir, ["restore"]).status).toBe(0);
      expect(existsSync(pathOf(first))).toBe(false);
      expect(existsSync(pathOf(second))).toBe(false);
    });

    it("refuses a malformed or unknown id and touches nothing", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const entered = enter(dir, "worktree", head);
      const before = readFileSync(recordPath(dir), "utf8");

      for (const [args, reason] of [
        [["not-an-id"], "bad-id"],
        [["--all"], "bad-id"],
        [[idOf(entered), "22222222-2222-2222-2222-222222222222"], "unknown-id"],
      ] as const) {
        const outcome = run(dir, ["restore", ...args]);

        expect(outcome.status).toBe(1);
        expect(outcome.json).toMatchObject({ ok: false, reason });
        expect(existsSync(pathOf(entered))).toBe(true);
        expect(readFileSync(recordPath(dir), "utf8")).toBe(before);
      }
    });

    it("reports recorded 0 for an id from the wrong directory", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const entered = enter(dir, "worktree", head);
      const wrong = run(pathOf(entered), ["restore", idOf(entered)]);

      expect(wrong.status).toBe(1);
      expect(wrong.json).toMatchObject({
        reason: "unknown-id",
        recorded: 0,
      });
    });
  });

  describe("restore with several entries", () => {
    it("lets one declined entry leave the others restored", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const worktree = pathOf(enter(dir, "worktree", head));
      const clone = pathOf(enter(dir, "clone", head));

      writeFileSync(join(dirname(clone), ".pr-review-marker"), "someone-else");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "restored")).toMatchObject([
        { kind: "worktree" },
      ]);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { kind: "clone" },
      ]);
      expect(existsSync(worktree)).toBe(false);
      expect(existsSync(clone)).toBe(true);
      expect(readRecord(dir).entries).toMatchObject([{ kind: "clone" }]);
    });
  });

  describe("record validation", () => {
    const validId = "11111111-1111-1111-1111-111111111111";
    const sha = "a".repeat(40);
    const checkout = {
      id: validId,
      kind: "checkout",
      headSha: sha,
      branch: "main",
      fromSha: sha,
    };
    const bad: [string, string][] = [
      ["invalid JSON", "{not json"],
      ["another version", JSON.stringify({ version: 2, entries: [] })],
      ["no entries list", JSON.stringify({ version: 1 })],
      [
        "a branch starting with a dash",
        JSON.stringify({
          version: 1,
          entries: [{ ...checkout, branch: "-x" }],
        }),
      ],
      [
        "a non-hex head sha",
        JSON.stringify({
          version: 1,
          entries: [{ ...checkout, headSha: "z".repeat(40) }],
        }),
      ],
      [
        "a short sha to return to",
        JSON.stringify({
          version: 1,
          entries: [{ ...checkout, fromSha: "abc" }],
        }),
      ],
      [
        "an unknown kind",
        JSON.stringify({
          version: 1,
          entries: [{ ...checkout, kind: "format" }],
        }),
      ],
      [
        "no id",
        JSON.stringify({ version: 1, entries: [{ ...checkout, id: 7 }] }),
      ],
      [
        "a relative path",
        JSON.stringify({
          version: 1,
          entries: [
            {
              id: validId,
              kind: "clone",
              headSha: sha,
              path: "pr-review-x/head",
              parent: "pr-review-x",
            },
          ],
        }),
      ],
      [
        "no root",
        JSON.stringify({
          version: 1,
          entries: [
            {
              id: validId,
              kind: "clone",
              headSha: sha,
              path: "/tmp/pr-review-x/head",
              parent: "/tmp/pr-review-x",
            },
          ],
        }),
      ],
      [
        "a parent that is not directly inside the root",
        JSON.stringify({
          version: 1,
          entries: [
            {
              id: validId,
              kind: "clone",
              headSha: sha,
              root: "/tmp/other",
              path: "/tmp/pr-review-x/head",
              parent: "/tmp/pr-review-x",
            },
          ],
        }),
      ],
      [
        "a relative root",
        JSON.stringify({
          version: 1,
          entries: [
            {
              id: validId,
              kind: "clone",
              headSha: sha,
              root: "tmp",
              path: "/tmp/pr-review-x/head",
              parent: "/tmp/pr-review-x",
            },
          ],
        }),
      ],
      [
        "a path that is not under a pr-review directory",
        JSON.stringify({
          version: 1,
          entries: [
            {
              id: validId,
              kind: "clone",
              headSha: sha,
              path: "/tmp/x/head",
              parent: "/tmp/x",
            },
          ],
        }),
      ],
    ];

    it.each(bad)("refuses a record with %s", (_name, content) => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      writeFileSync(recordPath(dir), content);

      const planned = run(dir, ["plan", head]);

      expect(planned.status).toBe(0);
      expect(planned.json).toMatchObject({
        record: { unreadable: true },
        checkout: { offered: false, reason: "recorded" },
      });

      const restored = run(dir, ["restore"]);

      expect(restored.status).toBe(1);
      expect(restored.json).toMatchObject({
        ok: false,
        reason: "record-unreadable",
      });
      expect(enter(dir, "worktree", head).json).toMatchObject({
        reason: "record-unreadable",
      });
      expect(enter(dir, "checkout", head).json).toMatchObject({
        reason: "record-unreadable",
      });
      expect(headOf(dir)).not.toBe(head);
      expect(
        scratchEntries().filter((name) => name.startsWith("pr-review-")),
      ).toEqual([]);

      const forgotten = run(dir, ["forget"]);

      expect(forgotten.status).toBe(0);
      expect(plan(dir, head).record).toBeNull();
    });

    it("refuses a record that is a symlink", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const target = nextPath("target");

      writeFileSync(target, JSON.stringify({ version: 1, entries: [] }));
      symlinkSync(target, recordPath(dir));

      expect(plan(dir, head).record).toMatchObject({ unreadable: true });
    });

    it("forget removes the record and touches nothing else", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const path = pathOf(enter(dir, "worktree", head));

      expect(run(dir, ["forget"]).json).toEqual({ ok: true, forgotten: true });
      expect(existsSync(recordPath(dir))).toBe(false);
      expect(existsSync(path)).toBe(true);
      expect(run(dir, ["forget"]).json).toEqual({ ok: true, forgotten: false });
    });
  });
});
