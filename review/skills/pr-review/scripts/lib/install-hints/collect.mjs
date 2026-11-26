import { dirOf } from "../paths.mjs";
import { sortBy } from "../sort.mjs";
import { listTree, makeSource } from "../tree.mjs";
import { findRootEntries } from "./entry-points.mjs";
import { findEnvExample } from "./env-example.mjs";
import { findLockfiles } from "./lockfiles.mjs";
import {
  findInstallHooks,
  findManifestEntries,
  readManifests,
} from "./manifests.mjs";
import { findRuntimes } from "./runtimes.mjs";
import { uniqueSorted } from "./text.mjs";
import { findTools } from "./tools.mjs";

export function collectHints(git, sha) {
  const src = makeSource(git, sha, listTree(git, sha));
  const lockfiles = findLockfiles(src);
  const dirs = uniqueSorted(["", ...lockfiles.map((lock) => dirOf(lock.path))]);
  const manifests = readManifests(src);
  const topManifests = manifests.filter(
    (manifest) => manifest.safe && dirs.includes(dirOf(manifest.path)),
  );
  const entryPoints = sortBy(
    [...findRootEntries(src), ...findManifestEntries(topManifests)],
    "path",
    "kind",
  );

  return {
    headSha: sha,
    lockfiles,
    entryPoints,
    installHooks: findInstallHooks(manifests),
    runtimes: findRuntimes(src, dirs, topManifests),
    tools: findTools(lockfiles, entryPoints),
    envExample: findEnvExample(src),
    skipped: src.skipped(),
  };
}
