import { recognisedLockfile } from "../lockfiles.mjs";
import { sortBy } from "../sort.mjs";
import { listTree, makeSource } from "../tree.mjs";

export function listLockfiles(git, sha) {
  const entries = listTree(git, sha);
  const src = makeSource(git, sha, entries);
  const found = new Map();

  for (const path of src.paths()) {
    const entry = recognisedLockfile(src, path);

    if (entry !== null) {
      found.set(path, { manager: entry.manager, blob: src.blob(path) });
    }
  }

  return found;
}

export function changedLockfiles(before, after) {
  const changed = [];

  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const now = after.get(path);

    if (before.get(path)?.blob !== now?.blob) {
      changed.push({
        path,
        manager: (now ?? before.get(path)).manager,
        exists: now !== undefined,
      });
    }
  }

  return sortBy(changed, "path");
}
