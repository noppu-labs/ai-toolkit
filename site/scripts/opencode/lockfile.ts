import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type LockSources,
  lockSchema,
  lockSourcesSchema,
  type OpenCodeLock,
} from "../../src/lib/opencode-lock.ts";

export const LOCK_FILE = "opencode-lock.json";

function readJson(siteDir: string): unknown {
  return JSON.parse(readFileSync(join(siteDir, LOCK_FILE), "utf8"));
}

/** The plugins to sync, which may still be bare sources. */
export function readLockSources(siteDir: string): LockSources {
  return lockSourcesSchema.parse(readJson(siteDir));
}

/** The full lock; throws while any entry is still a bare source. */
export function readLock(siteDir: string): OpenCodeLock {
  return lockSchema.parse(readJson(siteDir));
}

/** Writes the lock, keeping the plugin key order. */
export function writeLock(siteDir: string, lock: LockSources): void {
  writeFileSync(join(siteDir, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`);
}
