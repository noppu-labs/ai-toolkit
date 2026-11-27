import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  enter,
  git,
  listAt,
  makeBin,
  makeFixture,
  nextPath,
  pathOf,
  readRecord,
  recordPath,
  registerSandbox,
  run,
  sandbox,
  scratchEntries,
  write,
  writeRecord,
} from "./helpers.ts";

registerSandbox();

describe("head-setup.mjs", () => {
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

    it("compares paths as NFC on a filesystem that normalises them", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const root = nextPath("café");

      mkdirSync(root);

      const real = realpathSync(root);
      const path = pathOf(
        run(dir, ["enter", "worktree", head, "--scratch", real]),
      );

      if (process.platform !== "darwin") {
        return;
      }

      const record = readRecord(dir);
      const entry = record.entries[0] ?? {};

      writeRecord(dir, {
        version: 1,
        entries: [
          {
            ...entry,
            root: String(entry.root).normalize("NFD"),
            parent: String(entry.parent).normalize("NFD"),
            path: path.normalize("NFD"),
          },
        ],
      });

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(0);
      expect(git(dir, "worktree", "list", "--porcelain")).not.toContain(
        "prunable",
      );
      expect(existsSync(path)).toBe(false);
    });

    it.each([
      ["worktree add", "worktree"],
      ["clone", "clone"],
    ])("leaves no scratch directory when %s fails", (failing, kind) => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const wrapper = `#!/bin/sh\ncase "$*" in\n*" ${failing} "*) echo "fatal: boom" >&2; exit 128;;\nesac\nexec REAL_GIT "$@"\n`;
      const outcome = run(dir, ["enter", kind, head], makeBin(wrapper));

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({ reason: "setup-failed" });
      expect(
        scratchEntries().filter((name) => name.startsWith("pr-review-")),
      ).toEqual([]);
      expect(existsSync(recordPath(dir))).toBe(false);
    });
  });

  describe("leftovers of a restore", () => {
    it("removes a worktree directory git no longer lists once it carries our marker", (context) => {
      if (process.getuid?.() === 0) {
        context.skip();
      }

      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const path = pathOf(enter(dir, "worktree", head));
      const locked = join(path, "locked");

      write(path, "locked/f.txt", "x\n");
      chmodSync(locked, 0o555);

      try {
        expect(run(dir, ["restore"]).status).toBe(1);
      } finally {
        chmodSync(locked, 0o755);
      }

      const again = run(dir, ["restore"]);

      expect(again.status).toBe(0);
      expect(existsSync(path)).toBe(false);
      expect(existsSync(dirname(path))).toBe(false);
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    it("removes an unlisted directory of ours, but not one without the marker", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const path = pathOf(enter(dir, "worktree", head));

      git(dir, "worktree", "remove", "--force", path);
      mkdirSync(path);
      write(path, "stray.txt", "x\n");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(0);
      expect(existsSync(dirname(path))).toBe(false);

      const other = pathOf(enter(dir, "worktree", head));

      git(dir, "worktree", "remove", "--force", other);
      mkdirSync(other);
      write(other, "stray.txt", "x\n");
      writeFileSync(join(dirname(other), ".pr-review-marker"), "someone-else");

      expect(listAt(run(dir, ["restore"]).json, "declined")).toMatchObject([
        { reason: "not-a-worktree" },
      ]);
      expect(existsSync(join(other, "stray.txt"))).toBe(true);
    });

    it("removes the marked directory a crash left before worktree add", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const path = pathOf(enter(dir, "worktree", head));
      const parent = dirname(path);

      git(dir, "worktree", "remove", "--force", path);

      expect(existsSync(parent)).toBe(true);

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(0);
      expect(listAt(outcome.json, "restored")).toMatchObject([
        { missing: true },
      ]);
      expect(existsSync(parent)).toBe(false);
    });

    it("leaves an unmarked directory alone when the worktree is missing", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const path = pathOf(enter(dir, "worktree", head));
      const parent = dirname(path);

      git(dir, "worktree", "remove", "--force", path);
      writeFileSync(join(parent, ".pr-review-marker"), "someone-else");
      write(parent, "keep.txt", "x\n");

      expect(run(dir, ["restore"]).status).toBe(0);
      expect(existsSync(join(parent, "keep.txt"))).toBe(true);
    });
  });
});
