import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashDirectory } from "./hashing.ts";
import { readLock, writeLock } from "./lockfile.ts";
import { addSkill, makeRoot, requireEntry } from "./test-helpers.ts";
import { verifyAll } from "./verify.ts";

describe("verifyAll", () => {
  it("returns no problems for a consistent tree", (t) => {
    const root = makeRoot(t);
    const dir = addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" });
    const lock = readLock(root, "laravel");

    requireEntry(lock, "demo").vendoredHash = hashDirectory(dir);
    writeLock(root, "laravel", lock);

    expect(verifyAll(root)).toEqual([]);
  });

  it("flags tampered content, unlocked dirs, and missing dirs", (t) => {
    const root = makeRoot(t);
    const dir = addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" });
    const lock = readLock(root, "laravel");

    requireEntry(lock, "demo").vendoredHash = hashDirectory(dir);
    lock.skills.ghost = { sourceType: "local" }; // in lock, not on disk
    writeLock(root, "laravel", lock);
    writeFileSync(join(dir, "SKILL.md"), "# tampered");
    mkdirSync(join(root, "laravel", "skills", "unlocked"));
    writeFileSync(join(root, "laravel", "skills", "unlocked", "SKILL.md"), "x");

    const problems = verifyAll(root);

    expect(problems).toHaveLength(3);
    expect(problems).toContainEqual(
      expect.stringContaining("laravel/demo: content changed"),
    );
    expect(problems).toContainEqual(
      expect.stringContaining(
        "laravel/ghost: in skills-lock.json but missing on disk",
      ),
    );
    expect(problems).toContainEqual(
      expect.stringContaining(
        "laravel/unlocked: on disk but missing from skills-lock.json",
      ),
    );
  });

  it("flags github entries without a vendoredHash baseline", (t) => {
    const root = makeRoot(t);

    addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# demo" },
      {
        source: "owner/repo",
        sourceType: "github",
        ref: "main",
        skillPath: "skills/demo",
      },
    );

    const problems = verifyAll(root);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("missing vendoredHash");
  });
});
