import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

interface Tree {
  /** Regular files, as `/`-separated paths relative to the plugin folder. */
  files: string[];
  links: string[];
}

function walk(dir: string, prefix: string, tree: Tree): void {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = `${prefix}${item.name}`;
    if (item.isDirectory()) {
      walk(join(dir, item.name), `${path}/`, tree);
    } else if (item.isSymbolicLink()) {
      tree.links.push(path);
    } else if (item.isFile()) {
      tree.files.push(path);
    }
  }
}

/**
 * The files and symlinks in a plugin folder. Symlinks are listed and never
 * followed: `readdirSync`'s `recursive` option would follow one to a folder.
 */
function treeOf(dir: string): Tree {
  const tree: Tree = { files: [], links: [] };
  if (lstatSync(dir, { throwIfNoEntry: false })?.isDirectory() === true) {
    walk(dir, "", tree);
  }
  return tree;
}

function checkPlugin(
  siteDir: string,
  name: string,
  entry: LockEntry,
): string[] {
  const dir = contentDir(siteDir, name);
  const tree = treeOf(dir);
  const findings = Object.entries(entry.files).flatMap(([path, sha]) => {
    if (!tree.files.includes(path)) {
      return tree.links.includes(path) ? [] : [`${name}: ${path} is missing`];
    }
    const actual = createHash("sha256")
      .update(readFileSync(join(dir, path)))
      .digest("hex");
    return actual === sha ? [] : [`${name}: ${path} differs from the lock`];
  });
  const stray = tree.files
    .filter((path) => !Object.hasOwn(entry.files, path))
    .map((path) => `${name}: ${path} is not in the lock`);
  const links = tree.links.map((path) => `${name}: ${path} is a symlink`);
  return [...findings, ...stray, ...links];
}

/** Each item directly under the content root that is not a locked plugin's folder. */
function checkRoot(root: string, lock: OpenCodeLock): string[] {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true }).flatMap((item) => {
    if (!item.isDirectory()) {
      return [`${item.name}: not a plugin folder`];
    }
    return Object.hasOwn(lock.plugins, item.name)
      ? []
      : [`${item.name}: no entry in the lock`];
  });
}

/** Everything in the synced copies that disagrees with the lock. */
export function checkContent(siteDir: string, lock: OpenCodeLock): string[] {
  const findings = Object.entries(lock.plugins).flatMap(([name, entry]) =>
    checkPlugin(siteDir, name, entry),
  );
  return [...findings, ...checkRoot(join(siteDir, ...CONTENT_ROOT), lock)];
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
