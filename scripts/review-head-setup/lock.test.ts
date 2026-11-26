import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  enter,
  git,
  gitDirOf,
  headOf,
  isJson,
  makeBin,
  makeFixture,
  nextPath,
  type Outcome,
  readRecord,
  recordPath,
  registerSandbox,
  run,
  sandboxRoot,
  scratchDir,
  scratchEntries,
  script,
} from "./helpers.ts";

registerSandbox();

describe("head-setup.mjs", () => {
  describe("the lock", () => {
    const lockName = "pr-review-setup.lock";

    function lockOf(dir: string): string {
      return join(gitDirOf(dir), lockName);
    }

    function runAsync(
      cwd: string,
      args: string[],
      bin: string,
    ): Promise<Outcome> {
      sandboxRoot.assertInside(cwd);

      return new Promise((resolveRun, reject) => {
        const child = spawn(process.execPath, [script, ...args], {
          cwd,
          env: sandboxRoot.env({ PATH: bin, TMPDIR: scratchDir() }),
        });
        let out = "";

        child.stdout.on("data", (chunk: Buffer) => {
          out += chunk.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
          const parsed: unknown = JSON.parse(out);

          if (!isJson(parsed)) {
            reject(new Error(`head-setup printed ${out}`));

            return;
          }

          resolveRun({ status: code, json: parsed, stderr: "" });
        });
      });
    }

    it.each([
      ["enter", ["enter", "checkout", "HEAD_SHA"]],
      ["enter", ["enter", "worktree", "HEAD_SHA"]],
      ["enter", ["enter", "clone", "HEAD_SHA"]],
      ["restore", ["restore"]],
      ["forget", ["forget"]],
    ])("refuses %s with busy while a live process holds it", (_name, args) => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const before = headOf(dir);

      writeFileSync(lockOf(dir), String(process.pid));

      const outcome = run(
        dir,
        args.map((arg) => (arg === "HEAD_SHA" ? head : arg)),
      );

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({ ok: false, reason: "busy" });
      expect(readFileSync(lockOf(dir), "utf8")).toBe(String(process.pid));
      expect(headOf(dir)).toBe(before);
      expect(existsSync(recordPath(dir))).toBe(false);
      expect(
        scratchEntries().filter((name) => name.startsWith("pr-review-")),
      ).toEqual([]);
    });

    it.each([
      [
        "a dead process",
        (): string => String(spawnSync(process.execPath, ["-e", ""]).pid),
      ],
      ["an empty file", (): string => ""],
      ["zero", (): string => "0"],
      ["text", (): string => "not a pid"],
      ["a number with text after it", (): string => `${process.pid}abc`],
    ])("takes it over from %s", (_name, content) => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      writeFileSync(lockOf(dir), content());

      expect(enter(dir, "checkout", head).status).toBe(0);
      expect(existsSync(lockOf(dir))).toBe(false);
      expect(run(dir, ["restore"]).status).toBe(0);
    });

    it("writes its own pid while it holds the lock", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const log = nextPath("lock-log");
      const spy = `#!/bin/sh\ncase "$*" in\n*"switch --detach"*) read -r pid < "${lockOf(dir)}"; echo "$pid" > "${log}";;\nesac\nexec REAL_GIT "$@"\n`;

      expect(run(dir, ["enter", "checkout", head], makeBin(spy)).status).toBe(
        0,
      );
      expect(readFileSync(log, "utf8").trim()).toMatch(/^\d+$/);
    });

    it("is gone after a success, a refusal and a failure", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      for (const args of [
        ["enter", "checkout", head],
        ["enter", "checkout", head],
        ["enter", "worktree", "0".repeat(40)],
        ["restore", "not-an-id"],
        ["restore"],
        ["forget"],
        ["plan", head],
      ]) {
        run(dir, args);

        expect(existsSync(lockOf(dir))).toBe(false);
      }
    });

    it("keeps every record when enters run at once", async () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const bin = makeBin();
      const outcomes = await Promise.all(
        [1, 2, 3, 4].map(() => runAsync(dir, ["enter", "worktree", head], bin)),
      );
      const done = outcomes.filter((outcome) => outcome.json.ok === true);

      const refused = outcomes.filter((outcome) => outcome.json.ok === false);

      expect(refused.map((outcome) => outcome.json.reason)).toEqual(
        refused.map(() => "busy"),
      );
      expect(done.length + refused.length).toBe(outcomes.length);
      expect(done.length).toBeGreaterThan(0);
      expect(
        readRecord(dir)
          .entries.map((entry) => entry.id)
          .sort(),
      ).toEqual(done.map((outcome) => String(outcome.json.id)).sort());
      expect(
        git(dir, "worktree", "list", "--porcelain")
          .split("\n")
          .filter((line) => line.startsWith("worktree ")),
      ).toHaveLength(done.length + 1);
      expect(existsSync(lockOf(dir))).toBe(false);
    });

    it("falls back to an exclusive create when the filesystem has no hard links", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const preload = nextPath("no-link");

      writeFileSync(
        preload,
        `import fs from "node:fs";\nimport { syncBuiltinESMExports } from "node:module";\nfs.linkSync = () => { throw Object.assign(new Error("link"), { code: "ENOTSUP" }); };\nsyncBuiltinESMExports();\n`,
      );
      writeFileSync(`${preload}.mjs`, readFileSync(preload));

      const env = { NODE_OPTIONS: `--import=${preload}.mjs` };
      const entered = run(dir, ["enter", "checkout", head], makeBin(), env);

      expect(entered.status).toBe(0);
      expect(run(dir, ["restore"], makeBin(), env).status).toBe(0);
      expect(run(dir, ["forget"], makeBin(), env).status).toBe(0);

      writeFileSync(
        join(gitDirOf(dir), "pr-review-setup.lock"),
        String(process.pid),
      );

      expect(run(dir, ["forget"], makeBin(), env).json).toMatchObject({
        reason: "busy",
      });
    });

    it("writes the pid of the process that holds the lock", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const log = nextPath("lock-log");
      const spy = `#!/bin/sh\ncase "$*" in\n*"switch --detach"*) read -r pid < "${join(gitDirOf(dir), "pr-review-setup.lock")}"; echo "$pid $PPID" > "${log}";;\nesac\nexec REAL_GIT "$@"\n`;

      run(dir, ["enter", "checkout", head], makeBin(spy));

      const [held, parent] = readFileSync(log, "utf8").trim().split(" ");

      expect(held).toBe(parent);
    });

    it("treats a lock held by a process of another user as live", (context) => {
      if (process.getuid?.() === 0) {
        context.skip();
      }

      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      writeFileSync(join(gitDirOf(dir), "pr-review-setup.lock"), "1");

      expect(enter(dir, "checkout", head).json).toMatchObject({
        reason: "busy",
      });
    });

    it("takes over a lock that holds zero", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      writeFileSync(join(gitDirOf(dir), "pr-review-setup.lock"), "0");

      expect(enter(dir, "checkout", head).status).toBe(0);
    });
  });
});
