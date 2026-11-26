import { findExecutable } from "../exec.mjs";
import { MANAGER_BINARIES } from "./constants.mjs";
import { uniqueSorted } from "./text.mjs";

export function findTools(lockfiles, entryPoints) {
  const names = new Set(
    lockfiles.map((lock) => MANAGER_BINARIES[lock.manager] ?? lock.manager),
  );

  for (const kind of ["make", "just", "task"]) {
    if (entryPoints.some((entry) => entry.kind === kind)) {
      names.add(kind);
    }
  }

  return uniqueSorted(names).map((name) => ({
    name,
    onPath: findExecutable(name) !== null,
  }));
}
