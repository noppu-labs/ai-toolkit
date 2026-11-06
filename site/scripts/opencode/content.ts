import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { parse } from "yaml";
import type { LockEntry, OpenCodeLock } from "../../src/lib/opencode-lock.ts";
import {
  MANIFEST_PATH,
  type RawManifest,
  rawManifestSchema,
  YAML_OPTIONS,
} from "../../src/lib/opencode-schema.ts";
import { readLock } from "./lockfile.ts";

const CONTENT_ROOT = ["src", "content", "opencode"];

export function contentDir(siteDir: string, name: string): string {
  return join(siteDir, ...CONTENT_ROOT, name);
}

/** Replaces a plugin's folder with `files`, keyed by repo-relative path. */
export async function writePlugin(
  siteDir: string,
  name: string,
  files: Map<string, Uint8Array>,
): Promise<void> {
  const dir = contentDir(siteDir, name);
  await rm(dir, { recursive: true, force: true });
  await Promise.all(
    [...files].map(async ([path, bytes]) => {
      const target = join(dir, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }),
  );
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) =>
      relative(dir, join(item.parentPath, item.name)).split("\\").join("/"),
    );
}

function checkPlugin(
  siteDir: string,
  name: string,
  entry: LockEntry,
): string[] {
  const dir = contentDir(siteDir, name);
  const findings = Object.entries(entry.files).flatMap(([path, sha]) => {
    const file = join(dir, path);
    if (!existsSync(file)) {
      return [`${name}: ${path} is missing`];
    }
    const actual = createHash("sha256")
      .update(readFileSync(file))
      .digest("hex");
    return actual === sha ? [] : [`${name}: ${path} differs from the lock`];
  });
  const stray = filesUnder(dir)
    .filter((path) => !(path in entry.files))
    .map((path) => `${name}: ${path} is not in the lock`);
  return [...findings, ...stray];
}

/** Everything in the synced copies that disagrees with the lock. */
export function checkContent(siteDir: string, lock: OpenCodeLock): string[] {
  const root = join(siteDir, ...CONTENT_ROOT);
  const orphans = existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((item) => item.isDirectory() && !(item.name in lock.plugins))
        .map((item) => `${item.name}: no entry in the lock`)
    : [];
  const findings = Object.entries(lock.plugins).flatMap(([name, entry]) =>
    checkPlugin(siteDir, name, entry),
  );
  return [...findings, ...orphans];
}

/** Entries that pin a ref or a tag that is not the version's release tag. */
export function checkReleased(lock: OpenCodeLock): string[] {
  return Object.entries(lock.plugins).flatMap(([name, entry]) => {
    if (entry.ref !== undefined) {
      return [`${name}: pinned to ref ${entry.ref}, not a release`];
    }
    return entry.tag === `v${entry.version}`
      ? []
      : [`${name}: tag ${entry.tag} is not v${entry.version}`];
  });
}

/** Each locked plugin with its synced manifest parsed. */
export function readSyncedPlugins(
  siteDir: string,
): { name: string; entry: LockEntry; manifest: RawManifest }[] {
  return Object.entries(readLock(siteDir).plugins).map(([name, entry]) => {
    const text = readFileSync(
      join(contentDir(siteDir, name), MANIFEST_PATH),
      "utf8",
    );
    return {
      name,
      entry,
      manifest: rawManifestSchema.parse(parse(text, YAML_OPTIONS)),
    };
  });
}
