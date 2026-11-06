import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commitOf, sha256 } from "./fixtures.ts";
import { LOCK_FILE, readLock, readLockSources, writeLock } from "./lockfile.ts";

let dir = "";

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const source = (name: string): { repo: string; package: string } => ({
  repo: `noppu-labs/${name}`,
  package: `@noppu-labs/${name}`,
});

const full = (name: string): Record<string, unknown> => ({
  ...source(name),
  version: "1.0.0",
  tag: "v1.0.0",
  commit: commitOf("a"),
  license: "MIT",
  files: { "docs/a.txt": sha256(new TextEncoder().encode("a")) },
});

function put(plugins: Record<string, unknown>): void {
  dir = mkdtempSync(join(tmpdir(), "opencode-lock-"));
  writeFileSync(
    join(dir, LOCK_FILE),
    JSON.stringify({ lockfileVersion: 1, plugins }),
  );
}

describe("lockfile", () => {
  it("reads bare sources with readLockSources", () => {
    put({ "opencode-x": source("opencode-x") });
    expect(readLockSources(dir).plugins["opencode-x"]).toMatchObject(
      source("opencode-x"),
    );
  });

  it("reads full entries with readLock", () => {
    put({ "opencode-x": full("opencode-x") });
    expect(readLock(dir).plugins["opencode-x"]?.version).toBe("1.0.0");
  });

  it("throws from readLock while an entry is a bare source", () => {
    put({
      "opencode-x": full("opencode-x"),
      "opencode-y": source("opencode-y"),
    });
    expect(() => readLock(dir)).toThrow();
    expect(() => readLockSources(dir)).not.toThrow();
  });

  it("writes two-space JSON, a trailing newline and the plugin key order", () => {
    put({});
    const lock = {
      lockfileVersion: 1 as const,
      plugins: {
        "opencode-z": source("opencode-z"),
        "opencode-a": source("opencode-a"),
      },
    };
    writeLock(dir, lock);
    const text = readFileSync(join(dir, LOCK_FILE), "utf8");
    expect(text).toBe(`${JSON.stringify(lock, null, 2)}\n`);
    expect(Object.keys(JSON.parse(text).plugins)).toEqual([
      "opencode-z",
      "opencode-a",
    ]);
  });
});
