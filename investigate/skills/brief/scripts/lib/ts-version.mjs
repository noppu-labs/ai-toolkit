import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// typescript-language-server 5.x takes the first of these that exists in the
// workspace root or the nearest directory above it, then falls back to the
// TypeScript beside its own install.
const MODULE_FOLDERS = [
  "node_modules/typescript/lib",
  ".vscode/pnpify/typescript/lib",
  ".yarn/sdks/typescript/lib",
];

// The version the server reads for a tsserver.js, or null when it would not
// take that file.
function versionOf(tsserver) {
  if (!existsSync(tsserver)) return null;
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(tsserver, "..", "..", "package.json"), "utf8"),
    );
    return pkg?.version ? String(pkg.version) : null;
  } catch {
    return null;
  }
}

function workspaceTsserver(root) {
  for (let dir = root; ; dir = path.dirname(dir)) {
    const lib = MODULE_FOLDERS.map((m) => path.join(dir, m)).find((m) =>
      existsSync(m),
    );
    if (lib !== undefined) return path.join(lib, "tsserver.js");
    if (path.dirname(dir) === dir) return null;
  }
}

function onPath(cmd, env) {
  if (path.isAbsolute(cmd)) return cmd;
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (dir === "") continue;
    const full = path.join(dir, cmd);
    try {
      if (statSync(full).isFile()) return full;
    } catch {
      /* not in this directory */
    }
  }
  return null;
}

// Resolved from the real location of the server's own script, as the server
// resolves it. A launcher that is not a link to that script hides it.
function fallbackTsserver(cmd, env) {
  const bin = onPath(cmd, env);
  if (bin === null) return null;
  try {
    const main = createRequire(realpathSync(bin)).resolve("typescript");
    return path.join(path.dirname(main), "tsserver.js");
  } catch {
    return null;
  }
}

/**
 * The TypeScript the server would run, as { version, where }, or null when it
 * would find none.
 */
export function serverTypeScript(root, cmd, env) {
  const fromWorkspace = workspaceTsserver(root);
  const version = fromWorkspace === null ? null : versionOf(fromWorkspace);
  if (version !== null) return { version, where: "in or above the repository" };
  const fallback = fallbackTsserver(cmd, env);
  const fallbackVersion = fallback === null ? null : versionOf(fallback);

  return fallbackVersion === null
    ? null
    : { version: fallbackVersion, where: "beside the server" };
}

// "Only package name is allowed plugin name" arrived in 3.9.8, 4.0.6, 4.1.4
// and 4.2.1-rc. Before it, a tsconfig can name any file as a plugin.
const CHECKED_FROM = { 3.9: 8, "4.0": 6, 4.1: 4, 4.2: 1 };

/** True when this TypeScript refuses plugin names that are paths. */
export function refusesPluginPaths(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (m === null) return false;
  const [major, minor, patch] = m.slice(1).map(Number);
  const line = `${major}.${minor}`;
  if (Object.hasOwn(CHECKED_FROM, line)) return patch >= CHECKED_FROM[line];

  return major > 4 || (major === 4 && minor >= 3);
}
