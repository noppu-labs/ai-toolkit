import { existsSync, mkdirSync, renameSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  enter,
  git,
  headOf,
  listAt,
  makeFixture,
  pathOf,
  readRecord,
  recordPath,
  registerSandbox,
  run,
  sandbox,
  scratch,
  scratchEntries,
  write,
  writeRecord,
} from "./helpers.ts";

registerSandbox();

describe("head-setup.mjs", () => {
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

    it("refuses to remove a worktree whose scratch directory became a symlink to another pr-review directory", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const path = pathOf(enter(dir, "worktree", head));
      const parent = dirname(path);
      const moved = join(dirname(parent), "pr-review-moved");

      renameSync(parent, moved);
      symlinkSync(moved, parent);

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "not-ours" },
      ]);
      expect(existsSync(join(moved, "head", "b.txt"))).toBe(true);
    });

    it("refuses to remove a worktree whose head directory became a symlink", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const path = pathOf(enter(dir, "worktree", head));
      const moved = join(dirname(path), "moved");

      renameSync(path, moved);
      symlinkSync(moved, path);

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "not-ours" },
      ]);
      expect(existsSync(join(moved, "b.txt"))).toBe(true);
    });

    it("retries a worktree locked as initializing with --force --force, and only then", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const path = pathOf(enter(dir, "worktree", head));

      git(dir, "worktree", "lock", "--reason", "initializing", path);

      expect(run(dir, ["restore"]).status).toBe(0);
      expect(existsSync(path)).toBe(false);

      const other = pathOf(enter(dir, "worktree", head));

      git(dir, "worktree", "lock", "--reason", "mine", other);

      const outcome = run(dir, ["restore"]);

      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "remove-failed" },
      ]);
      expect(existsSync(other)).toBe(true);
    });
  });
});
