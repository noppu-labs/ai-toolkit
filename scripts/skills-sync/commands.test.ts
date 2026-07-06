import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect } from "vitest";
import {
  acceptSkill,
  diffSkill,
  getStatusRows,
  parseSkillArg,
  pullSkill,
  seedSkill,
} from "./commands.ts";
import { hashDirectory } from "./hashing.ts";
import { readLock, writeLock } from "./lockfile.ts";
import {
  addSkill,
  makeFakeFetcher,
  makeGithubEntry,
  makeRoot,
  requireEntry,
} from "./test-helpers.ts";
import { PLUGINS } from "./types.ts";

describe("parseSkillArg", () => {
  it("splits <plugin>/<skill> and rejects unknown plugins", () => {
    expect(parseSkillArg("laravel/demo")).toEqual({
      plugin: "laravel",
      name: "demo",
    });
    expect(() => parseSkillArg("nope/demo")).toThrow(/expected/);
    expect(() => parseSkillArg(undefined)).toThrow(/expected/);
  });

  // Property: total over arbitrary input — every string (or undefined) either
  // yields a valid {plugin, name} or throws an Error, never anything else.
  it.prop([fc.option(fc.string(), { nil: undefined })])(
    "yields a valid pair or throws an Error",
    (arg) => {
      try {
        const { plugin, name } = parseSkillArg(arg);

        return PLUGINS.includes(plugin) && name.length > 0;
      } catch (error) {
        return error instanceof Error;
      }
    },
  );
});

describe("getStatusRows", () => {
  it("classifies via the injected fetcher and reports fetch errors", (t) => {
    const root = makeRoot(t);
    const dir = addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# demo" },
      makeGithubEntry(),
    );
    const lock = readLock(root, "laravel");
    const upstream = makeFakeFetcher({ "SKILL.md": "# demo" })();
    const demo = requireEntry(lock, "demo");

    demo.vendoredHash = hashDirectory(dir);
    demo.upstreamHash = upstream.hash;
    lock.skills.other = { sourceType: "local" };
    writeLock(root, "laravel", lock);
    addSkill(root, "laravel", "other", { "SKILL.md": "x" });

    const rows = getStatusRows(root, () => upstream);

    expect(rows.find((r) => r.id === "laravel/demo")).toEqual({
      id: "laravel/demo",
      state: "up-to-date",
    });
    expect(rows.find((r) => r.id === "laravel/other")).toEqual({
      id: "laravel/other",
      state: "local",
    });

    const failing = getStatusRows(root, () => {
      throw new Error("boom");
    });

    expect(failing.find((r) => r.id === "laravel/demo")?.state).toMatch(
      /^fetch-error/,
    );
  });

  it("reports fetch-error when a github entry is missing upstream coordinates", (t) => {
    const root = makeRoot(t);

    // sourceType github but no source/ref/skillPath to fetch from.
    addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# demo" },
      {
        sourceType: "github",
      },
    );

    const rows = getStatusRows(root, () => {
      throw new Error("fetcher must not be reached");
    });

    expect(rows.find((r) => r.id === "laravel/demo")?.state).toContain(
      "missing upstream coordinates",
    );
  });

  it("reports fetch-error for a missing skill directory without aborting the run", (t) => {
    const root = makeRoot(t);
    const dir = addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# demo" },
      makeGithubEntry(),
    );
    const lock = readLock(root, "laravel");
    const upstream = makeFakeFetcher({ "SKILL.md": "# demo" })();
    const demo = requireEntry(lock, "demo");

    demo.vendoredHash = hashDirectory(dir);
    demo.upstreamHash = upstream.hash;
    lock.skills.ghost = makeGithubEntry(); // in lock, but no skill directory on disk
    writeLock(root, "laravel", lock);

    const rows = getStatusRows(root, () => upstream);

    expect(rows.find((r) => r.id === "laravel/demo")).toEqual({
      id: "laravel/demo",
      state: "up-to-date",
    });
    expect(rows.find((r) => r.id === "laravel/ghost")?.state).toMatch(
      /^fetch-error/,
    );
  });
});

describe("pullSkill", () => {
  it("rejects skills that are missing from the lock or have no github upstream", (t) => {
    const root = makeRoot(t);

    addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" }); // local

    expect(() => pullSkill(root, "laravel", "ghost")).toThrow(
      /not in skills-lock.json/,
    );
    expect(() => pullSkill(root, "laravel", "demo")).toThrow(
      /no github upstream/,
    );
  });

  it("refuses to overwrite local changes without force, then overwrites with force", (t) => {
    const root = makeRoot(t);
    const dir = addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# local edit" },
      makeGithubEntry({
        vendoredHash: "stale-baseline",
        upstreamHash: "stale-upstream",
      }),
    );
    const fetcher = makeFakeFetcher({
      "SKILL.md": "# upstream v2",
      "references/new.md": "ref",
    });

    expect(() => pullSkill(root, "laravel", "demo", { fetcher })).toThrow(
      /diverged/,
    );

    const state = pullSkill(root, "laravel", "demo", { fetcher, force: true });

    expect(state).toBe("diverged");
    expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toBe("# upstream v2");
    expect(readFileSync(join(dir, "references/new.md"), "utf8")).toBe("ref");

    const entry = requireEntry(readLock(root, "laravel"), "demo");

    expect(entry.upstreamCommit).toBe("cafe1234");
    expect(entry.upstreamHash).toBe(fetcher().hash);
    expect(entry.vendoredHash).toBe(hashDirectory(dir));
  });

  it("fast-forwards an upstream-updated skill", (t) => {
    const root = makeRoot(t);
    const dir = addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# v1" },
      makeGithubEntry(),
    );
    const lock = readLock(root, "laravel");
    const demo = requireEntry(lock, "demo");

    demo.vendoredHash = hashDirectory(dir);
    demo.upstreamHash = makeFakeFetcher({ "SKILL.md": "# v1" })().hash;
    writeLock(root, "laravel", lock);

    const state = pullSkill(root, "laravel", "demo", {
      fetcher: makeFakeFetcher({ "SKILL.md": "# v2" }),
    });

    expect(state).toBe("upstream-updated");
    expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toBe("# v2");
  });
});

describe("acceptSkill", () => {
  it("re-baselines only vendoredHash", (t) => {
    const root = makeRoot(t);
    const dir = addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# edited" },
      makeGithubEntry({
        vendoredHash: "old",
        upstreamHash: "u1",
        upstreamCommit: "c1",
      }),
    );

    acceptSkill(root, "laravel", "demo");

    const entry = requireEntry(readLock(root, "laravel"), "demo");

    expect(entry.vendoredHash).toBe(hashDirectory(dir));
    expect(entry.upstreamHash).toBe("u1");
    expect(entry.upstreamCommit).toBe("c1");
  });
});

describe("seedSkill", () => {
  it("baselines local skills offline and github skills via fetcher", (t) => {
    const root = makeRoot(t);
    const localDir = addSkill(root, "laravel", "custom", {
      "SKILL.md": "# custom",
    });

    seedSkill(root, "laravel", "custom");

    expect(requireEntry(readLock(root, "laravel"), "custom").vendoredHash).toBe(
      hashDirectory(localDir),
    );

    const ghDir = addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# demo" },
      makeGithubEntry(),
    );
    const fetcher = makeFakeFetcher({ "SKILL.md": "# upstream" }, "feed5678");

    seedSkill(root, "laravel", "demo", fetcher);

    const entry = requireEntry(readLock(root, "laravel"), "demo");

    expect(entry.vendoredHash).toBe(hashDirectory(ghDir));
    expect(entry.upstreamCommit).toBe("feed5678");
    expect(entry.upstreamHash).toBe(fetcher().hash);
  });
});

describe("diffSkill", () => {
  it("rejects skills without a github upstream", (t) => {
    const root = makeRoot(t);

    addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" }); // local

    expect(() => diffSkill(root, "laravel", "demo")).toThrow(
      /no github upstream/,
    );
  });

  it("returns git's exit status: 0 for identical content, 1 for differences", (t) => {
    const root = makeRoot(t);

    addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# same" },
      makeGithubEntry(),
    );

    expect(
      diffSkill(
        root,
        "laravel",
        "demo",
        makeFakeFetcher({ "SKILL.md": "# same" }),
      ),
    ).toBe(0);
    expect(
      diffSkill(
        root,
        "laravel",
        "demo",
        makeFakeFetcher({ "SKILL.md": "# different" }),
      ),
    ).toBe(1);
  });

  it("throws when the underlying spawnSync call fails (e.g. git missing from PATH)", (t) => {
    const root = makeRoot(t);

    addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# demo" },
      makeGithubEntry(),
    );

    const emptyPathDir = mkdtempSync(join(tmpdir(), "empty-path-"));
    const originalPath = process.env.PATH;

    t.onTestFinished(() => {
      process.env.PATH = originalPath;
      rmSync(emptyPathDir, { recursive: true, force: true });
    });
    process.env.PATH = emptyPathDir;

    expect(() =>
      diffSkill(
        root,
        "laravel",
        "demo",
        makeFakeFetcher({ "SKILL.md": "# demo" }),
      ),
    ).toThrow(/ENOENT/);
  });
});
