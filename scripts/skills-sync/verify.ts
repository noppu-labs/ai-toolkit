// Consistency checks between skills-lock.json and the skills/ directories.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hashDirectory } from "./hashing.ts";
import { readLock } from "./lockfile.ts";
import { type LockEntry, type LockFile, PLUGINS } from "./types.ts";

function unlockedDirProblems(
  root: string,
  plugin: string,
  lock: LockFile,
): string[] {
  return readdirSync(join(root, plugin, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !lock.skills[entry.name])
    .map(
      (entry) =>
        `${plugin}/${entry.name}: on disk but missing from skills-lock.json`,
    );
}

function lockEntryProblem(
  root: string,
  plugin: string,
  name: string,
  entry: LockEntry,
): string | null {
  const dir = join(root, plugin, "skills", name);

  if (!existsSync(dir)) {
    return `${plugin}/${name}: in skills-lock.json but missing on disk`;
  }

  if (entry.vendoredHash && hashDirectory(dir) !== entry.vendoredHash) {
    return `${plugin}/${name}: content changed since last baseline (run accept or seed)`;
  }

  if (!entry.vendoredHash && entry.sourceType === "github") {
    return `${plugin}/${name}: missing vendoredHash baseline (run seed)`;
  }

  return null;
}

export function verifyAll(root: string): string[] {
  return PLUGINS.flatMap((plugin) => {
    const lock = readLock(root, plugin);
    const entryProblems = Object.entries(lock.skills).map(([name, entry]) =>
      lockEntryProblem(root, plugin, name, entry),
    );

    return [
      ...unlockedDirProblems(root, plugin, lock),
      ...entryProblems,
    ].filter((problem): problem is string => problem !== null);
  });
}
