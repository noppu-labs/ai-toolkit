import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  branchOf,
  commit,
  enter,
  git,
  gitDirOf,
  headOf,
  listAt,
  makeFixture,
  makeHead,
  makeRepo,
  nextPath,
  plan,
  readRecord,
  recordPath,
  registerSandbox,
  run,
  switchCommand,
  tryGit,
  write,
} from "./helpers.ts";

registerSandbox();

describe("head-setup.mjs", () => {
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

    it.each([
      ["MERGE_HEAD", "file"],
      ["CHERRY_PICK_HEAD", "file"],
      ["REVERT_HEAD", "file"],
      ["BISECT_LOG", "file"],
      ["rebase-merge", "dir"],
      ["rebase-apply", "dir"],
    ])("refuses a check-out while %s exists", (name, type) => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const marker = join(gitDirOf(dir), name);

      if (type === "dir") {
        mkdirSync(marker);
      } else {
        writeFileSync(marker, "x\n");
      }

      expect(plan(dir, head).checkout).toEqual({
        offered: false,
        reason: "dirty",
      });
      expect(enter(dir, "checkout", head).json).toMatchObject({
        ok: false,
        reason: "operation-in-progress",
        detail: expect.stringContaining(name),
      });
      expect(existsSync(recordPath(dir))).toBe(false);
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

    it("declines a check-out restore with busy while index.lock exists, and only for a check-out", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);

      const lock = join(gitDirOf(dir), "index.lock");

      writeFileSync(lock, "");

      const outcome = run(dir, ["restore"]);
      const declined = listAt(outcome.json, "declined");

      expect(outcome.status).toBe(1);
      expect(declined).toMatchObject([{ kind: "checkout", reason: "busy" }]);
      expect(String(declined[0]?.detail)).toContain(lock);
      expect(String(declined[0]?.detail)).toContain("delete");
      expect(headOf(dir)).toBe(head);

      rmSync(lock);

      expect(run(dir, ["restore"]).status).toBe(0);
    });

    it("restores a clone while index.lock exists", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "clone", head);
      writeFileSync(join(gitDirOf(dir), "index.lock"), "");

      expect(run(dir, ["restore"]).status).toBe(0);
    });
  });

  describe("lockfiles after the switch back", () => {
    it("lists the lockfiles that differ between the head and where it returned", () => {
      const { dir, head } = makeFixture(
        { "package-lock.json": "1\n", "composer.lock": "1\n" },
        { "package-lock.json": "2\n" },
      );

      enter(dir, "checkout", head);

      expect(run(dir, ["restore"]).json.changedLockfiles).toEqual([
        { path: "package-lock.json", manager: "npm", exists: true },
      ]);
    });

    it("says whether each changed lockfile exists in the tree switched back to", () => {
      const dir = makeRepo({
        "package.json": "{}\n",
        "package-lock.json": "1\n",
      });

      git(dir, "switch", "-q", "-c", "pr");
      git(dir, "rm", "-q", "package-lock.json");
      commit(dir, {
        "pnpm-lock.yaml": "lockfileVersion: 9\n",
        "web/package.json": "{}\n",
        "web/package-lock.json": "1\n",
      });

      const head = headOf(dir);

      git(dir, "switch", "-q", "main");
      enter(dir, "checkout", head);

      expect(run(dir, ["restore"]).json.changedLockfiles).toEqual([
        { path: "package-lock.json", manager: "npm", exists: true },
        { path: "pnpm-lock.yaml", manager: "pnpm", exists: false },
        { path: "web/package-lock.json", manager: "npm", exists: false },
      ]);
    });
  });
});
