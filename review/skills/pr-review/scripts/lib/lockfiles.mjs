import { posix } from "node:path";
import { dirOf, isSafePath, isVendored, pathIn } from "./paths.mjs";

export const LOCKFILES = new Map([
  ["composer.lock", { manager: "composer", command: "composer install" }],
  ["package-lock.json", { manager: "npm", command: "npm ci" }],
  [
    "pnpm-lock.yaml",
    { manager: "pnpm", command: "pnpm install --frozen-lockfile" },
  ],
  ["yarn.lock", { manager: "yarn", command: "yarn install --frozen-lockfile" }],
  ["bun.lock", { manager: "bun", command: "bun install --frozen-lockfile" }],
  ["bun.lockb", { manager: "bun", command: "bun install --frozen-lockfile" }],
  ["uv.lock", { manager: "uv", command: "uv sync --locked" }],
  ["poetry.lock", { manager: "poetry", command: "poetry install" }],
  ["Gemfile.lock", { manager: "bundler", command: "bundle install" }],
  ["go.sum", { manager: "go", command: "go mod download" }],
]);

const INSTALL_DIRS = ["node_modules", "vendor", ".venv", ".pnp.cjs"];

// An install writes into these entries, so a tracked symlink there would send the
// install outside the tree.
function symlinkedInstallDir(src, path) {
  const dir = dirOf(path);
  const link = INSTALL_DIRS.map((name) => pathIn(dir, name)).find(
    (candidate) => src.mode(candidate) === "120000",
  );

  if (link !== undefined) {
    src.skip(link, "symlinked-install-dir");
  }

  return link !== undefined;
}

export function recognisedLockfile(src, path) {
  const entry = LOCKFILES.get(posix.basename(path));

  if (entry === undefined || isVendored(path)) {
    return null;
  }

  const safe = isSafePath(path);

  if (!safe) {
    src.skip(path, "unsafe-path");
  }

  const admitted = src.admit(path);

  if (!safe || !admitted || symlinkedInstallDir(src, path)) {
    return null;
  }

  return entry;
}
