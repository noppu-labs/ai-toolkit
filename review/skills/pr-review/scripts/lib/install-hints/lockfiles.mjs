import { recognisedLockfile } from "../lockfiles.mjs";
import { dirOf, pathIn } from "../paths.mjs";
import { sortBy } from "../sort.mjs";

export function findLockfiles(src) {
  const found = [];

  for (const path of src.paths()) {
    const entry = recognisedLockfile(src, path);

    if (entry === null) {
      continue;
    }

    const immutable =
      entry.manager === "yarn" && src.has(pathIn(dirOf(path), ".yarnrc.yml"));

    found.push({
      path,
      manager: entry.manager,
      likelyCommand: immutable ? "yarn install --immutable" : entry.command,
    });
  }

  return sortBy(found, "path");
}
