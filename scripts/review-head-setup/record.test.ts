import {
  chmodSync,
  existsSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  branchOf,
  enter,
  gitDirOf,
  headOf,
  listAt,
  makeBin,
  makeFixture,
  nextPath,
  type Outcome,
  pathOf,
  plan,
  readRecord,
  recordPath,
  registerSandbox,
  run,
  scratchEntries,
  write,
} from "./helpers.ts";

registerSandbox();

describe("head-setup.mjs", () => {
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

    it("keeps the previous record, and leaves no scratch, when a write fails", (context) => {
      if (process.getuid?.() === 0) {
        context.skip();
      }

      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "worktree", head);

      const before = readFileSync(recordPath(dir), "utf8");
      const gitDir = gitDirOf(dir);
      // The lock is already taken when git is first asked where the common
      // directory is, so only the record's own write meets the closed directory.
      const closing = `#!/bin/sh\ncase "$*" in\n*"--git-common-dir"*) "${process.execPath}" -e 'require("fs").chmodSync(process.argv[1], 0o555)' "${gitDir}";;\nesac\nexec REAL_GIT "$@"\n`;

      try {
        const outcome = run(dir, ["enter", "worktree", head], makeBin(closing));

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

    it("refuses a malformed id and touches nothing", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const entered = enter(dir, "worktree", head);
      const before = readFileSync(recordPath(dir), "utf8");

      for (const [args, reason] of [
        [["not-an-id"], "bad-id"],
        [["--all"], "bad-id"],
        [[idOf(entered), "not-an-id"], "bad-id"],
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
        ok: false,
        reason: "declined",
        recorded: 0,
        declined: [{ id: idOf(entered), reason: "unknown-id" }],
      });
    });

    it("restores the ids it knows and lists an unknown one as declined", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const entered = enter(dir, "worktree", head);
      const other = "22222222-2222-2222-2222-222222222222";
      const outcome = run(dir, ["restore", other, idOf(entered)]);

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({
        ok: false,
        reason: "declined",
        recorded: 1,
        restored: [{ id: idOf(entered) }],
        declined: [{ id: other, reason: "unknown-id" }],
      });
      expect(existsSync(pathOf(entered))).toBe(false);
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    it("declines an id nothing recorded and touches nothing", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const entered = enter(dir, "worktree", head);
      const before = readFileSync(recordPath(dir), "utf8");
      const outcome = run(dir, [
        "restore",
        "22222222-2222-2222-2222-222222222222",
      ]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "unknown-id" },
      ]);
      expect(existsSync(pathOf(entered))).toBe(true);
      expect(readFileSync(recordPath(dir), "utf8")).toBe(before);
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

    it("turns a thrown restore into a declined entry and goes on with the rest", (context) => {
      if (process.getuid?.() === 0) {
        context.skip();
      }

      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);

      const clone = pathOf(enter(dir, "clone", head));
      const locked = join(clone, "locked");

      write(clone, "locked/f.txt", "x\n");
      chmodSync(locked, 0o555);

      try {
        const outcome = run(dir, ["restore"]);

        expect(outcome.status).toBe(1);
        expect(listAt(outcome.json, "restored")).toMatchObject([
          { kind: "checkout" },
        ]);
        expect(listAt(outcome.json, "declined")).toMatchObject([
          { kind: "clone", reason: "error" },
        ]);
        expect(branchOf(dir)).toBe("main");
        expect(readRecord(dir).entries).toMatchObject([{ kind: "clone" }]);
      } finally {
        chmodSync(locked, 0o755);
      }

      expect(run(dir, ["restore"]).status).toBe(0);
      expect(existsSync(clone)).toBe(false);
    });

    it("restores the newest entry first", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "worktree", head);
      enter(dir, "clone", head);
      enter(dir, "checkout", head);

      const outcome = run(dir, ["restore"]);

      expect(
        listAt(outcome.json, "restored").map((entry) => entry.kind),
      ).toEqual(["checkout", "clone", "worktree"]);
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
