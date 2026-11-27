import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { realGit } from "../review-test-git.ts";
import {
  branchOf,
  commit,
  enter,
  type Files,
  git,
  gitDirOf,
  headOf,
  listAt,
  makeBin,
  makeFixture,
  makeRepo,
  readRecord,
  recordPath,
  registerSandbox,
  run,
  sandboxRoot,
  switchCommand,
  write,
} from "./helpers.ts";

registerSandbox();

describe("head-setup.mjs", () => {
  describe("what counts as a changed tree", () => {
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

    it("switches back at once when the head leaves the tree changed, and keeps the record while the change stays", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const outcome = run(
        dir,
        ["enter", "checkout", head],
        makeBin(dirtyingWrapper("")),
      );

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({
        reason: "switch-incomplete",
        id: readRecord(dir).entries[0]?.id,
        dirtyPaths: ["notes.txt"],
        command: switchCommand(dir, "main", true),
      });
      expect(branchOf(dir)).toBe("main");
      expect(readRecord(dir).entries).toHaveLength(1);
    });

    it("keeps the record and says so when it cannot switch back", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const failing = `*"switch --no-guess --no-overwrite-ignore main"*) echo "boom" >&2; exit 1;;\n`;
      const outcome = run(
        dir,
        ["enter", "checkout", head],
        makeBin(dirtyingWrapper(failing)),
      );

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({
        reason: "switch-back-failed",
        id: readRecord(dir).entries[0]?.id,
        dirtyPaths: ["notes.txt"],
      });
      expect(String(outcome.json.detail)).toContain("boom");
      expect(outcome.json.command).toBe(switchCommand(dir, "main", true));
      expect(String(outcome.json.detail)).toContain("discards every change");
      expect(String(outcome.json.detail)).toContain("untracked");
      expect(headOf(dir)).toBe(head);
      expect(readRecord(dir).entries).toHaveLength(1);
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

    it("ignores a tracked submodule move when the tree is back, and counts it when a switch fails", () => {
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
      git(dir, "switch", "-q", "-c", "moved");
      git(dir, "update-index", "--cacheinfo", `160000,${subB},sub`);
      git(dir, "commit", "-q", "-m", "move");

      const moved = headOf(dir);

      git(dir, "switch", "-q", "main");

      const lockHead = `#!/bin/sh\ncase "$*" in\n*"switch --detach"*) : > "${join(gitDirOf(dir), "HEAD.lock")}";;\nesac\nexec REAL_GIT "$@"\n`;
      const failed = run(dir, ["enter", "checkout", moved], makeBin(lockHead));

      expect(failed.json).toMatchObject({ reason: "switch-incomplete" });
      expect(String(listAt({ x: failed.json.dirtyPaths }, "x"))).toBeDefined();
      expect(failed.json.dirtyPaths).toEqual(["sub"]);

      rmSync(join(gitDirOf(dir), "HEAD.lock"));
      run(dir, ["forget"]);
      git(dir, "reset", "-q", "--hard", "main");
      expect(enter(dir, "checkout", moved).status).toBe(0);
      git(dir, "switch", "-q", "main");
      git(dir, "-C", "sub", "checkout", "-q", subB);

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(0);
      expect(listAt(outcome.json, "restored")).toMatchObject([
        { alreadyBack: true },
      ]);
    });

    it("does not refuse a check-out because the head's .gitignore stops ignoring a user file", () => {
      const { dir, head } = makeFixture(
        { ".gitignore": "coverage/\n" },
        { ".gitignore": "" },
      );

      write(dir, "coverage/report.txt", "r\n");

      const outcome = enter(dir, "checkout", head);

      expect(outcome.status).toBe(0);
      expect(outcome.json).toMatchObject({ ok: true, kind: "checkout" });
      expect(headOf(dir)).toBe(head);
      expect(readRecord(dir).entries).toHaveLength(1);
    });

    it("does not decline a restore because an install wrote an untracked file, and lists it", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);
      write(dir, "z-install.log", "l\n");
      write(dir, "a dir/out.txt", "o\n");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(0);
      expect(listAt(outcome.json, "restored")).toMatchObject([
        { untracked: ["a dir/", "z-install.log"] },
      ]);
      expect(branchOf(dir)).toBe("main");
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    it("still declines a restore on a tracked change", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);
      write(dir, "notes.txt", "edited\n");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "dirty", dirtyPaths: ["notes.txt"] },
      ]);
      expect(headOf(dir)).toBe(head);
    });

    it("lists the untracked paths of a tree that is already back", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);
      git(dir, "switch", "-q", "main");
      write(dir, "mine.txt", "x\n");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(0);
      expect(listAt(outcome.json, "restored")).toMatchObject([
        { alreadyBack: true, untracked: ["mine.txt"] },
      ]);
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    function caseInsensitive(): boolean {
      const probe = makeRepo();

      return (
        git(
          probe,
          "config",
          "--type=bool",
          "--default=false",
          "--get",
          "core.ignorecase",
        ) === "true"
      );
    }

    it("never drops the record of a head whose names differ only in case while the tree is changed", (context) => {
      if (!caseInsensitive()) {
        context.skip();
      }

      const dir = makeRepo({ "README.md": "mine\n" });
      const base = git(dir, "rev-parse", "HEAD");
      const listing = git(dir, "ls-tree", base);
      const lowered = spawnSync(realGit, ["hash-object", "-w", "--stdin"], {
        cwd: dir,
        input: "head\n",
        encoding: "utf8",
        env: sandboxRoot.env(),
      }).stdout.trim();

      const tree = spawnSync(realGit, ["mktree"], {
        cwd: dir,
        input: `${listing}\n100644 blob ${lowered}\treadme.md\n`,
        encoding: "utf8",
        env: sandboxRoot.env(),
      }).stdout.trim();
      const head = git(dir, "commit-tree", tree, "-p", base, "-m", "case");
      const outcome = enter(dir, "checkout", head);

      const recorded = existsSync(recordPath(dir));
      const clean = git(dir, "status", "--porcelain") === "";

      expect(recorded || clean).toBe(true);
      expect(recorded ? outcome.json.reason : "switch-incomplete").toBe(
        "switch-incomplete",
      );
      expect(
        clean ? readFileSync(join(dir, "README.md"), "utf8") : "mine\n",
      ).toBe("mine\n");
    });
  });

  describe("restore when the tree is already back", () => {
    it("declines back-but-dirty while a tracked file has changes", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);
      git(dir, "switch", "-q", "main");
      write(dir, "notes.txt", "edited\n");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "back-but-dirty", dirtyPaths: ["notes.txt"] },
      ]);
      expect(readRecord(dir).entries).toHaveLength(1);
    });

    it("still drops the entry once the tree is clean", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);
      git(dir, "switch", "-q", "main");
      write(dir, "notes.txt", "edited\n");
      run(dir, ["restore"]);
      git(dir, "checkout", "--", "notes.txt");

      expect(listAt(run(dir, ["restore"]).json, "restored")).toMatchObject([
        { alreadyBack: true },
      ]);
      expect(existsSync(recordPath(dir))).toBe(false);
    });
  });
});
