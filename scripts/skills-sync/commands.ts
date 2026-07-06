// The sync operations behind each CLI command: status, pull, accept, seed,
// diff, and the <plugin>/<skill> argument parser they share.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getErrorMessage } from "./errors.ts";
import { hashDirectory } from "./hashing.ts";
import { classify, readLock, writeLock } from "./lockfile.ts";
import {
  type Fetcher,
  type LockEntry,
  type LockFile,
  PLUGINS,
  type StatusRow,
  type SyncState,
  type UpstreamSource,
} from "./types.ts";
import { fetchUpstream } from "./upstream.ts";

export function parseSkillArg(arg: string | undefined): {
  plugin: string;
  name: string;
} {
  const [plugin = "", ...rest] = (arg ?? "").split("/");
  const name = rest.join("/");

  if (!PLUGINS.includes(plugin) || !name) {
    throw new Error(
      `expected <plugin>/<skill> with plugin one of: ${PLUGINS.join(", ")}`,
    );
  }

  return { plugin, name };
}

function assertUpstream(
  plugin: string,
  name: string,
  entry: LockEntry,
): UpstreamSource {
  const { source, ref, skillPath } = entry;

  if (!source || !ref || !skillPath) {
    throw new Error(
      `${plugin}/${name} lock entry is missing upstream coordinates`,
    );
  }

  return { source, ref, skillPath };
}

function requireEntry(
  root: string,
  plugin: string,
  name: string,
): { lock: LockFile; entry: LockEntry } {
  const lock = readLock(root, plugin);
  const entry = lock.skills[name];

  if (!entry) {
    throw new Error(`${plugin}/${name} not in skills-lock.json`);
  }

  return { lock, entry };
}

export function getStatusRows(
  root: string,
  fetcher: Fetcher = fetchUpstream,
): StatusRow[] {
  const rows: StatusRow[] = [];

  for (const plugin of PLUGINS) {
    const lock = readLock(root, plugin);

    for (const [name, entry] of Object.entries(lock.skills)) {
      const id = `${plugin}/${name}`;

      if (entry.sourceType === "local") {
        rows.push({ id, state: "local" });
        continue;
      }

      try {
        const upstream = fetcher(assertUpstream(plugin, name, entry));
        const vendored = hashDirectory(join(root, plugin, "skills", name));

        rows.push({ id, state: classify(entry, vendored, upstream.hash) });
      } catch (error) {
        rows.push({
          id,
          state: `fetch-error (${getErrorMessage(error).trim()})`,
        });
      }
    }
  }

  return rows;
}

function writeUpstreamTo(dir: string, files: Map<string, Buffer>): void {
  for (const [rel, buf] of files) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), buf);
  }
}

export function pullSkill(
  root: string,
  plugin: string,
  name: string,
  {
    force = false,
    fetcher = fetchUpstream,
  }: { force?: boolean; fetcher?: Fetcher } = {},
): SyncState {
  const { lock, entry } = requireEntry(root, plugin, name);

  if (entry.sourceType !== "github") {
    throw new Error(
      `${plugin}/${name} has no github upstream; nothing to pull`,
    );
  }

  const dir = join(root, plugin, "skills", name);
  const upstream = fetcher(assertUpstream(plugin, name, entry));
  const state = classify(entry, hashDirectory(dir), upstream.hash);

  if ((state === "locally-modified" || state === "diverged") && !force) {
    throw new Error(
      `${plugin}/${name} is ${state}; run diff and merge manually, or pass --force to overwrite local changes`,
    );
  }

  rmSync(dir, { recursive: true });
  writeUpstreamTo(dir, upstream.files);

  entry.upstreamCommit = upstream.commit;
  entry.upstreamHash = upstream.hash;
  entry.vendoredHash = hashDirectory(dir);
  writeLock(root, plugin, lock);

  return state;
}

export function acceptSkill(root: string, plugin: string, name: string): void {
  const { lock, entry } = requireEntry(root, plugin, name);

  entry.vendoredHash = hashDirectory(join(root, plugin, "skills", name));
  writeLock(root, plugin, lock);
}

export function seedSkill(
  root: string,
  plugin: string,
  name: string,
  fetcher: Fetcher = fetchUpstream,
): { customized: boolean } {
  const { lock, entry } = requireEntry(root, plugin, name);

  entry.vendoredHash = hashDirectory(join(root, plugin, "skills", name));

  if (entry.sourceType === "github") {
    const upstream = fetcher(assertUpstream(plugin, name, entry));

    entry.upstreamCommit = upstream.commit;
    entry.upstreamHash = upstream.hash;
  }

  writeLock(root, plugin, lock);

  return {
    customized:
      entry.sourceType === "github" &&
      entry.vendoredHash !== entry.upstreamHash,
  };
}

export function diffSkill(
  root: string,
  plugin: string,
  name: string,
  fetcher: Fetcher = fetchUpstream,
): number {
  const { entry } = requireEntry(root, plugin, name);

  if (entry.sourceType !== "github") {
    throw new Error(
      `${plugin}/${name} has no github upstream; nothing to diff`,
    );
  }

  const tmp = mkdtempSync(join(tmpdir(), "skills-sync-"));

  try {
    writeUpstreamTo(tmp, fetcher(assertUpstream(plugin, name, entry)).files);

    const result = spawnSync(
      "git",
      ["diff", "--no-index", join(root, plugin, "skills", name), tmp],
      { stdio: "inherit" },
    );

    if (result.error) {
      throw result.error;
    }

    return result.status ?? 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
