import { posix } from "node:path";
import { isSafePath, isVendored } from "./paths.mjs";

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

export function recognisedLockfile(src, path) {
  const entry = LOCKFILES.get(posix.basename(path));

  if (entry === undefined || isVendored(path)) {
    return null;
  }

  const safe = isSafePath(path);

  if (!safe) {
    src.skip(path, "unsafe-path");
  }

  return src.admit(path) && safe ? entry : null;
}
