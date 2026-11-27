import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  branchOf,
  enter,
  git,
  headOf,
  makeBin,
  makeFixture,
  makeRepo,
  nextPath,
  registerSandbox,
  run,
} from "./helpers.ts";

registerSandbox();

describe("head-setup.mjs", () => {
  describe("the session's directory", () => {
    it("keeps a directory the head removes, so restore still runs from it", () => {
      const dir = makeRepo({ "d/x.txt": "x\n" });

      git(dir, "switch", "-q", "-c", "pr");
      git(dir, "rm", "-rq", "d");
      git(dir, "commit", "-q", "-m", "remove d");

      const head = headOf(dir);
      const sub = join(dir, "d");

      git(dir, "switch", "-q", "main");

      expect(enter(sub, "checkout", head).status).toBe(0);
      expect(existsSync(sub)).toBe(true);
      expect(run(sub, ["restore"]).status).toBe(0);
      expect(branchOf(dir)).toBe("main");
      expect(existsSync(join(sub, "x.txt"))).toBe(true);
    });
  });

  describe("the git environment", () => {
    it.each([
      ["GIT_DIR", (dir: string): string => join(dir, ".git")],
      ["GIT_INDEX_FILE", (dir: string): string => join(dir, ".git", "index")],
      ["GIT_COMMON_DIR", (dir: string): string => join(dir, ".git")],
      ["GIT_PREFIX", (): string => "elsewhere/"],
      ["GIT_NAMESPACE", (): string => "ns"],
      [
        "GIT_OBJECT_DIRECTORY",
        (dir: string): string => join(dir, ".git", "nope"),
      ],
      [
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        (dir: string): string => join(dir, ".git", "nope"),
      ],
    ])("ignores %s and leaves the user's tree alone", (name, value) => {
      for (const kind of ["clone", "worktree"]) {
        const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
        const before = [headOf(dir), branchOf(dir)];
        const outcome = run(dir, ["enter", kind, head], makeBin(), {
          [name]: value(dir),
        });

        expect(outcome.status).toBe(0);
        expect([headOf(dir), branchOf(dir)]).toEqual(before);
        expect(git(dir, "status", "--porcelain")).toBe("");
        expect(run(dir, ["restore"]).status).toBe(0);
      }
    });

    it("never lets GIT_WORK_TREE move the check-out", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const outcome = run(dir, ["enter", "checkout", head], makeBin(), {
        GIT_WORK_TREE: nextPath("elsewhere"),
      });

      expect(outcome.status).toBe(0);
      expect(headOf(dir)).toBe(head);
    });

    it("runs every git call that changes a tree with hooks and submodule recursion off", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const log = nextPath("git-log");
      const spy = `#!/bin/sh\necho "$*" >> "${log}"\nexec REAL_GIT "$@"\n`;

      for (const kind of ["checkout", "worktree", "clone"]) {
        run(dir, ["enter", kind, head], makeBin(spy));
      }

      run(dir, ["restore"], makeBin(spy));

      const changing = readFileSync(log, "utf8")
        .split("\n")
        .filter((line) =>
          / (switch|worktree add|worktree remove|clone) /.test(` ${line} `),
        );

      expect(changing.length).toBeGreaterThanOrEqual(6);

      for (const line of changing) {
        expect(line).toContain(
          "-c core.hooksPath=/dev/null -c submodule.recurse=false",
        );
      }
    });

    it("tells every git call that the user's location variables do not apply", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const log = nextPath("env-log");
      const spy = `#!/bin/sh\nexport -p >> "${log}"\nexec REAL_GIT "$@"\n`;
      const names = [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_NAMESPACE",
        "GIT_PREFIX",
      ];
      const env = Object.fromEntries(names.map((name) => [name, "x"]));

      run(dir, ["plan", head], makeBin(spy), env);

      const logged = readFileSync(log, "utf8");

      expect(logged).toContain("GIT_OPTIONAL_LOCKS");

      for (const name of names) {
        expect(logged, name).not.toContain(`${name}=`);
      }
    });
  });

  describe("the PATH", () => {
    it("never runs a git from a PATH entry inside the repository", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const marker = nextPath("planted");
      const planted = join(dir, "bin");

      mkdirSync(planted);
      writeFileSync(
        join(planted, "git"),
        `#!/bin/sh\ntouch "${marker}"\nexit 1\n`,
      );
      chmodSync(join(planted, "git"), 0o755);

      const outcome = run(
        dir,
        ["plan", head],
        `${planted}${delimiter}${makeBin()}`,
      );

      expect(outcome.status).toBe(0);
      expect(existsSync(marker)).toBe(false);
    });
  });
});
