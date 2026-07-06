// Shared fixtures for the skills-sync test suites: a throwaway plugin tree
// rooted in a temp dir, plus lock-entry and fetcher factories.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "vitest";
import { hashFiles } from "./hashing.ts";
import { readLock, writeLock } from "./lockfile.ts";
import {
  type LockEntry,
  type LockFile,
  PLUGINS,
  type UpstreamSnapshot,
  type UpstreamSource,
} from "./types.ts";

export function makeRoot(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "ai-toolkit-test-"));

  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  for (const plugin of PLUGINS) {
    mkdirSync(join(root, plugin, "skills"), { recursive: true });
    writeLock(root, plugin, { version: 1, skills: {} });
  }

  return root;
}

export function addSkill(
  root: string,
  plugin: string,
  name: string,
  files: Record<string, string>,
  entry: LockEntry = { sourceType: "local" },
): string {
  const dir = join(root, plugin, "skills", name);

  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }

  const lock = readLock(root, plugin);

  lock.skills[name] = entry;
  writeLock(root, plugin, lock);

  return dir;
}

export function requireEntry(lock: LockFile, name: string): LockEntry {
  const entry = lock.skills[name];

  if (!entry) {
    throw new Error(`${name} missing from lock`);
  }

  return entry;
}

export function makeFakeFetcher(
  files: Record<string, string>,
  commit = "cafe1234",
): () => UpstreamSnapshot {
  const map = new Map<string, Buffer>(
    Object.entries(files).map(([k, v]) => [k, Buffer.from(v)]),
  );

  return () => ({ commit, files: map, hash: hashFiles(map) });
}

export function makeGithubEntry(
  overrides: Pick<
    LockEntry,
    "vendoredHash" | "upstreamHash" | "upstreamCommit"
  > = {},
): LockEntry & UpstreamSource {
  return {
    source: "owner/repo",
    sourceType: "github",
    ref: "main",
    skillPath: "skills/demo",
    ...overrides,
  };
}
