import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { git } from "./investigate-git.ts";

describe("git", () => {
  it("returns trimmed stdout on success and throws with stderr on failure", (t) => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-git-fixture-"));

    t.onTestFinished(() => rmSync(cwd, { recursive: true, force: true }));
    git(cwd, "init", "-q");

    expect(git(cwd, "rev-parse", "--is-inside-work-tree")).toBe("true");
    expect(() => git(cwd, "rev-parse", "--verify", "no-such-ref")).toThrow(
      /fatal/,
    );
  });
});
