import { sortBy } from "./sort.mjs";

const MODE_REASONS = new Map([
  ["120000", "symlink"],
  ["160000", "submodule"],
]);

// Path to { mode, blob } for every entry of a commit's tree.
export function listTree(git, sha) {
  const entries = new Map();
  const output = git.text(["ls-tree", "-r", "--full-tree", "-z", sha]);

  for (const record of output.split("\0")) {
    const tab = record.indexOf("\t");

    if (tab !== -1) {
      const [mode, , blob] = record.slice(0, tab).split(" ");

      entries.set(record.slice(tab + 1), { mode, blob });
    }
  }

  return entries;
}

export function makeSource(git, sha, entries) {
  const cache = new Map();
  const skipped = new Map();
  const skip = (path, reason) => {
    skipped.set(`${path}\0${reason}`, { path, reason });
  };
  const admit = (path) => {
    const reason = MODE_REASONS.get(entries.get(path)?.mode);

    if (reason === undefined) {
      return true;
    }

    skip(path, reason);

    return false;
  };
  const read = (path) => {
    if (!entries.has(path) || !admit(path)) {
      return null;
    }

    if (!cache.has(path)) {
      try {
        cache.set(path, git.text(["show", `${sha}:${path}`]));
      } catch {
        skip(path, "unreadable");
        cache.set(path, null);
      }
    }

    return cache.get(path);
  };

  return {
    has: (path) => entries.has(path),
    blob: (path) => entries.get(path)?.blob ?? null,
    mode: (path) => entries.get(path)?.mode ?? null,
    paths: () => [...entries.keys()],
    admit,
    read,
    skip,
    skipped: () => sortBy([...skipped.values()], "path", "reason"),
  };
}
