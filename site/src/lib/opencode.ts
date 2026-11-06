import type { OpenCodeLock } from "./opencode-lock.ts";

export const OPENCODE_PATH = "/opencode";

/** The plugins the hub lists first, in this order; any other follows by name. */
export const OPENCODE_PLUGIN_ORDER: readonly string[] = [
  "opencode-permission-reviewer",
  "opencode-cache-manager",
];

export interface OpenCodePlugin<P> {
  name: string;
  repo: string;
  package: string;
  version: string;
  license: string;
  page: P;
}

export function opencodePluginPath(name: string): string {
  return `${OPENCODE_PATH}/${name}`;
}

export function npmPackageUrl(pkg: string): string {
  return `https://www.npmjs.com/package/${pkg}`;
}

export function githubRepoUrl(repo: string): string {
  return `https://github.com/${repo}`;
}

function rank(name: string): number {
  const index = OPENCODE_PLUGIN_ORDER.indexOf(name);
  return index === -1 ? OPENCODE_PLUGIN_ORDER.length : index;
}

/** Joins each synced page to its lock entry, so a page never ships without a pinned version. */
export function joinOpenCodePlugins<P>(
  entries: readonly { id: string; data: P }[],
  lock: OpenCodeLock,
): OpenCodePlugin<P>[] {
  const ids = new Set(entries.map((entry) => entry.id));
  const locked = new Set(Object.keys(lock.plugins));
  const unmatched = [
    ...[...ids].filter((id) => !locked.has(id)),
    ...[...locked].filter((name) => !ids.has(name)),
  ];
  if (unmatched.length > 0) {
    throw new Error(
      `opencode collection and opencode-lock.json disagree: ${unmatched.join(", ")}`,
    );
  }
  return entries
    .map((entry): OpenCodePlugin<P> => {
      const locks = lock.plugins[entry.id];
      if (locks === undefined) {
        throw new Error(`opencode-lock.json has no entry for ${entry.id}`);
      }
      return {
        name: entry.id,
        repo: locks.repo,
        package: locks.package,
        version: locks.version,
        license: locks.license,
        page: entry.data,
      };
    })
    .sort(
      (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name),
    );
}
