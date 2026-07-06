// Reading, writing, and classifying <plugin>/skills-lock.json entries.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LockEntry, LockFile, SyncState } from "./types.ts";

export function parseLock(text: string): LockFile {
  return JSON.parse(text) as LockFile;
}

export function readLock(root: string, plugin: string): LockFile {
  return parseLock(
    readFileSync(join(root, plugin, "skills-lock.json"), "utf8"),
  );
}

export function writeLock(root: string, plugin: string, lock: LockFile): void {
  writeFileSync(
    join(root, plugin, "skills-lock.json"),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
}

export function classify(
  entry: LockEntry,
  vendoredHashNow: string | undefined,
  upstreamHashNow: string | undefined,
): SyncState {
  if (entry.sourceType === "local") {
    return "local";
  }

  const localChanged = vendoredHashNow !== entry.vendoredHash;
  const upstreamChanged = upstreamHashNow !== entry.upstreamHash;

  if (localChanged && upstreamChanged) {
    return "diverged";
  }

  if (upstreamChanged) {
    return "upstream-updated";
  }

  if (localChanged) {
    return "locally-modified";
  }

  return "up-to-date";
}
