import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  enter,
  git,
  gitDirOf,
  headsOf,
  isJson,
  makeFixture,
  nextPath,
  plan,
  recordPath,
  registerSandbox,
  run,
  write,
} from "./helpers.ts";

registerSandbox();

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

      const json = plan(dir, base, head);

      expect(json).toMatchObject({
        branch: null,
        clean: false,
        checkout: { offered: false, reason: "dirty" },
      });
      expect(
        headsOf({ status: 0, json, stderr: "" }).map((h) => h.atTree),
      ).toEqual([true, false]);
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

  describe("the check-out target", () => {
    it("is not offered when the last head is the tree's commit", () => {
      const { dir, base, head } = makeFixture({}, { "b.txt": "b\n" });

      expect(plan(dir, head, base).checkout).toEqual({
        offered: false,
        reason: "at-head",
      });
      expect(plan(dir, base, head).checkout).toEqual({
        offered: true,
        reason: null,
      });
    });

    it("keeps recorded ahead of at-head", () => {
      const { dir, base, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);

      expect(plan(dir, head, base).checkout).toEqual({
        offered: false,
        reason: "recorded",
      });
    });
  });
});
