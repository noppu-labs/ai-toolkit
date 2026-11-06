import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LockEntry, OpenCodeLock } from "../../src/lib/opencode-lock.ts";
import {
  checkContent,
  checkReleased,
  contentDir,
  readSyncedPlugins,
  writePlugin,
} from "./content.ts";
import { commitOf, fixtureManifest, sha256 } from "./fixtures.ts";
import { writeLock } from "./lockfile.ts";

const enc = new TextEncoder();
let siteDir = "";

afterEach(() => {
  if (siteDir !== "") {
    rmSync(siteDir, { recursive: true, force: true });
    siteDir = "";
  }
});

function entry(
  files: Record<string, string>,
  extra: Partial<LockEntry> = {},
): LockEntry {
  return {
    repo: "noppu-labs/opencode-x",
    package: "@noppu-labs/opencode-x",
    version: "1.0.0",
    tag: "v1.0.0",
    commit: commitOf("a"),
    license: "MIT",
    files: Object.fromEntries(
      Object.entries(files).map(([path, body]) => [
        path,
        sha256(enc.encode(body)),
      ]),
    ),
    ...extra,
  };
}

function setup(): { lock: OpenCodeLock; dir: string } {
  siteDir = mkdtempSync(join(tmpdir(), "opencode-content-"));
  return {
    dir: siteDir,
    lock: {
      lockfileVersion: 1,
      plugins: {
        "opencode-x": entry({ "docs/a.txt": "a", "docs/b/c.txt": "c" }),
      },
    },
  };
}

async function writeAll(dir: string): Promise<void> {
  await writePlugin(
    dir,
    "opencode-x",
    new Map([
      ["docs/a.txt", enc.encode("a")],
      ["docs/b/c.txt", enc.encode("c")],
    ]),
  );
}

describe("writePlugin", () => {
  it("writes nested files and removes stale ones", async () => {
    const { dir } = setup();
    await writeAll(dir);
    const stale = join(contentDir(dir, "opencode-x"), "docs", "old.txt");
    writeFileSync(stale, "old");
    await writeAll(dir);
    expect(() => readFileSync(stale)).toThrow();
    expect(
      readFileSync(join(contentDir(dir, "opencode-x"), "docs/b/c.txt"), "utf8"),
    ).toBe("c");
  });

  it("puts a plugin under src/content/opencode", () => {
    expect(contentDir("/s", "p")).toBe("/s/src/content/opencode/p");
  });
});

describe("checkContent", () => {
  it("returns nothing for clean content", async () => {
    const { dir, lock } = setup();
    await writeAll(dir);
    expect(checkContent(dir, lock)).toEqual([]);
  });

  it("reports an edited file, a missing file, a stray file and a folder with no entry", async () => {
    const { dir, lock } = setup();
    await writeAll(dir);
    const root = contentDir(dir, "opencode-x");
    writeFileSync(join(root, "docs/a.txt"), "edited");
    rmSync(join(root, "docs/b/c.txt"));
    writeFileSync(join(root, "docs/stray.txt"), "s");
    mkdirSync(contentDir(dir, "opencode-ghost"), { recursive: true });
    const findings = checkContent(dir, lock);
    expect(findings).toHaveLength(4);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("opencode-x: docs/a.txt differs"),
        expect.stringContaining("opencode-x: docs/b/c.txt is missing"),
        expect.stringContaining(
          "opencode-x: docs/stray.txt is not in the lock",
        ),
        expect.stringContaining("opencode-ghost: no entry"),
      ]),
    );
  });

  it("tolerates a content folder that does not exist", () => {
    const { dir, lock } = setup();
    expect(checkContent(dir, { ...lock, plugins: {} })).toEqual([]);
  });
});

describe("checkReleased", () => {
  it("reports a ref entry and a tag that does not match the version", () => {
    const { lock } = setup();
    const findings = checkReleased({
      lockfileVersion: 1,
      plugins: {
        "opencode-x": entry({}, { ref: "feat/y", tag: "feat/y" }),
        "opencode-y": entry({}, { version: "1.0.1" }),
        "opencode-z": lock.plugins["opencode-x"] as LockEntry,
      },
    });
    expect(findings).toEqual([
      "opencode-x: pinned to ref feat/y, not a release",
      "opencode-y: tag v1.0.0 is not v1.0.1",
    ]);
  });
});

describe("readSyncedPlugins", () => {
  it("parses the synced manifests", async () => {
    const { dir } = setup();
    const manifest = enc.encode(fixtureManifest());
    await writePlugin(
      dir,
      "opencode-x",
      new Map([["docs/toolkit-page.yaml", manifest]]),
    );
    writeLock(dir, {
      lockfileVersion: 1,
      plugins: { "opencode-x": entry({}, {}) },
    });
    const [plugin] = readSyncedPlugins(dir);
    expect(plugin?.name).toBe("opencode-x");
    expect(plugin?.manifest.schemaVersion).toBe(1);
    expect(dirname(contentDir(dir, "opencode-x"))).toContain("opencode");
  });
});
