#!/usr/bin/env node
// Report what a commit's tree says about installing the project, as JSON.
//
// Usage: node install-hints.mjs <sha>   (run with the cwd inside the repository)
//
// It reads the tree at <sha> through git, never the working tree, and prints
// lockfiles, install entry points, install hooks, runtime pins, the tools those
// imply (and whether each is on PATH), and an env example file. The shape is
// described by ../references/install-hints.schema.json. It decides nothing: the
// caller picks the install command.

import { execFileSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join, posix } from "node:path";

const INSTALL_LIKE = /install|setup|bootstrap|init/i;
const DOCS_HEADING = /install|setup|getting started|bootstrap/i;
const SHA_ARG = /^[0-9a-fA-F]{4,40}$/;
const REF_ARG = /^[^-\s][^\s]*$/;

const NPM_HOOKS = ["preinstall", "install", "postinstall", "prepare"];
const COMPOSER_HOOKS = [
  "pre-install-cmd",
  "post-install-cmd",
  "post-autoload-dump",
];

const LOCKFILES = new Map([
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

const MANAGER_BINARIES = { bundler: "bundle" };

const MAKE_FILES = ["Makefile", "makefile", "GNUmakefile"];
const JUST_FILES = ["justfile", "Justfile"];
const TASK_FILES = ["Taskfile.yml", "Taskfile.yaml"];
const SCRIPT_FILES = [
  "bin/setup",
  "script/setup",
  "bin/bootstrap",
  "script/bootstrap",
];
const DOCS_FILES = ["README.md", "CONTRIBUTING.md", "CLAUDE.md"];

function compare(a, b) {
  if (a < b) {
    return -1;
  }

  return a > b ? 1 : 0;
}

function sortBy(items, ...keys) {
  return [...items].sort((a, b) => {
    for (const key of keys) {
      const order = compare(a[key], b[key]);

      if (order !== 0) {
        return order;
      }
    }

    return 0;
  });
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 1 << 28,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function resolveCommit(arg) {
  if (!SHA_ARG.test(arg) && !REF_ARG.test(arg)) {
    return null;
  }

  try {
    const sha = git(["rev-parse", "--verify", "--quiet", `${arg}^{commit}`]);

    return /^[0-9a-f]{40}$/.test(sha.trim()) ? sha.trim() : null;
  } catch {
    return null;
  }
}

function makeReader(sha, tree) {
  const cache = new Map();

  return (path) => {
    if (!tree.has(path)) {
      return null;
    }

    if (!cache.has(path)) {
      cache.set(path, git(["show", `${sha}:${path}`]));
    }

    return cache.get(path);
  };
}

function parseJsonObject(text) {
  if (text === null) {
    return null;
  }

  try {
    const value = JSON.parse(text);

    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

function isVendored(path) {
  const segments = path.split("/").slice(0, -1);

  return segments.includes("vendor") || segments.includes("node_modules");
}

function dirOf(path) {
  const dir = posix.dirname(path);

  return dir === "." ? "" : dir;
}

function pathIn(dir, name) {
  return dir === "" ? name : `${dir}/${name}`;
}

function findLockfiles(files, tree) {
  const found = [];

  for (const path of files) {
    const entry = LOCKFILES.get(posix.basename(path));

    if (entry === undefined || isVendored(path)) {
      continue;
    }

    const immutable =
      entry.manager === "yarn" && tree.has(pathIn(dirOf(path), ".yarnrc.yml"));

    found.push({
      path,
      manager: entry.manager,
      likelyCommand: immutable ? "yarn install --immutable" : entry.command,
    });
  }

  return sortBy(found, "path");
}

function uniqueSorted(names) {
  return [...new Set(names)].sort(compare);
}

function makeTargets(text) {
  const names = [];

  for (const line of text.split("\n")) {
    const match = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*::?(?![:=])/.exec(line);

    if (match !== null) {
      names.push(match[1]);
    }
  }

  return names;
}

function justRecipes(text) {
  const names = [];

  for (const line of text.split("\n")) {
    const match = /^@?([A-Za-z_][A-Za-z0-9_-]*)(?:\s[^:=]*)?:(?!=)/.exec(line);

    if (match !== null) {
      names.push(match[1]);
    }
  }

  return names;
}

function taskNames(text) {
  const names = [];
  let inTasks = false;

  for (const line of text.split("\n")) {
    if (/^tasks:\s*(#.*)?$/.test(line)) {
      inTasks = true;
    } else if (/^\S/.test(line)) {
      inTasks = false;
    }

    const match = inTasks ? /^ {2}([^\s:#][^:]*?):/.exec(line) : null;

    if (match !== null) {
      names.push(match[1]);
    }
  }

  return names;
}

function docsHeadings(text) {
  const names = [];
  let inFence = false;

  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    }

    const match = inFence ? null : /^ {0,3}#{1,6}\s+(.+?)\s*$/.exec(line);
    const heading = match?.[1].replace(/\s+#+$/, "").trim();

    if (heading && DOCS_HEADING.test(heading)) {
      names.push(heading);
    }
  }

  return names;
}

function findRootEntries(read, tree) {
  const entries = [];
  const kinds = [
    [MAKE_FILES, "make", makeTargets],
    [JUST_FILES, "just", justRecipes],
    [TASK_FILES, "task", taskNames],
  ];

  for (const [files, kind, extract] of kinds) {
    for (const path of files.filter((file) => tree.has(file))) {
      const names = uniqueSorted(
        extract(read(path)).filter((name) => INSTALL_LIKE.test(name)),
      );

      if (names.length > 0) {
        entries.push({ path, kind, names });
      }
    }
  }

  for (const path of SCRIPT_FILES.filter((file) => tree.has(file))) {
    entries.push({ path, kind: "script-file", names: [] });
  }

  for (const path of DOCS_FILES.filter((file) => tree.has(file))) {
    const names = uniqueSorted(docsHeadings(read(path)));

    if (names.length > 0) {
      entries.push({ path, kind: "docs-section", names });
    }
  }

  return entries;
}

function hookCommand(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.every((part) => typeof part === "string")) {
    return value.join(" && ");
  }

  return null;
}

function readManifests(read, dirs) {
  const manifests = [];
  const kinds = [
    ["composer.json", "composer-script", COMPOSER_HOOKS],
    ["package.json", "npm-script", NPM_HOOKS],
  ];

  for (const dir of dirs) {
    for (const [file, kind, hooks] of kinds) {
      const path = pathIn(dir, file);
      const json = parseJsonObject(read(path));

      if (json !== null) {
        manifests.push({ path, kind, hooks, json });
      }
    }
  }

  return manifests;
}

function scriptsOf(json) {
  const scripts = json.scripts;

  return scripts !== null && typeof scripts === "object" ? scripts : {};
}

function findManifestEntries(manifests) {
  const entries = [];

  for (const { path, kind, hooks, json } of manifests) {
    const names = Object.keys(scriptsOf(json)).filter(
      (name) => INSTALL_LIKE.test(name) && !hooks.includes(name),
    );

    if (names.length > 0) {
      entries.push({ path, kind, names: uniqueSorted(names) });
    }
  }

  return entries;
}

function findInstallHooks(manifests) {
  const found = [];

  for (const { path, hooks, json } of manifests) {
    const scripts = scriptsOf(json);

    for (const name of hooks) {
      const command = hookCommand(scripts[name]);

      if (command !== null) {
        found.push({ path, name, command });
      }
    }
  }

  return sortBy(found, "path", "name");
}

function toolVersions(text) {
  const found = [];

  for (const line of text.split("\n")) {
    const [tool, version] = line.replace(/#.*$/, "").trim().split(/\s+/);

    if (tool && version) {
      found.push({ tool, version });
    }
  }

  return found;
}

function findPinnedRuntimes(read, dir) {
  const found = [];
  const pins = [
    [".nvmrc", "node"],
    [".node-version", "node"],
    [".python-version", "python"],
  ];

  for (const [file, tool] of pins) {
    const version = read(pathIn(dir, file))?.trim();

    if (version) {
      found.push({ path: pathIn(dir, file), tool, version });
    }
  }

  const path = pathIn(dir, ".tool-versions");

  for (const entry of toolVersions(read(path) ?? "")) {
    found.push({ path, ...entry });
  }

  return found;
}

function findManifestRuntimes(manifests) {
  const found = [];

  for (const { path, kind, json } of manifests) {
    const isComposer = kind === "composer-script";
    const engine = isComposer ? json.require?.php : json.engines?.node;

    if (typeof engine === "string" && engine.trim() !== "") {
      found.push({
        path,
        tool: isComposer ? "php" : "node",
        version: engine.trim(),
      });
    }
  }

  return found;
}

function findRuntimes(read, dirs, manifests) {
  const found = [
    ...dirs.flatMap((dir) => findPinnedRuntimes(read, dir)),
    ...findManifestRuntimes(manifests),
  ];

  return sortBy(found, "path", "tool", "version");
}

function isOnPath(name) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(dir, name);

    try {
      if (dir !== "" && statSync(candidate).isFile()) {
        accessSync(candidate, constants.X_OK);

        return true;
      }
    } catch {
      // Not here or not executable: try the next directory.
    }
  }

  return false;
}

function findTools(lockfiles, entryPoints) {
  const names = new Set(
    lockfiles.map((lock) => MANAGER_BINARIES[lock.manager] ?? lock.manager),
  );

  for (const kind of ["make", "just", "task"]) {
    if (entryPoints.some((entry) => entry.kind === kind)) {
      names.add(kind);
    }
  }

  return uniqueSorted(names).map((name) => ({ name, onPath: isOnPath(name) }));
}

function findEnvExample(tree) {
  return [".env.example", ".env.dist"].find((file) => tree.has(file)) ?? null;
}

function collectHints(sha) {
  const files = git(["ls-tree", "-r", "--name-only", "-z", sha])
    .split("\0")
    .filter((path) => path !== "");
  const tree = new Set(files);
  const read = makeReader(sha, tree);
  const lockfiles = findLockfiles(files, tree);
  const dirs = uniqueSorted(["", ...lockfiles.map((lock) => dirOf(lock.path))]);
  const manifests = readManifests(read, dirs);
  const entryPoints = sortBy(
    [...findRootEntries(read, tree), ...findManifestEntries(manifests)],
    "path",
    "kind",
  );

  return {
    headSha: sha,
    lockfiles,
    entryPoints,
    installHooks: findInstallHooks(manifests),
    runtimes: findRuntimes(read, dirs, manifests),
    tools: findTools(lockfiles, entryPoints),
    envExample: findEnvExample(tree),
  };
}

function main() {
  const arg = process.argv[2];

  if (arg === undefined || arg === "") {
    process.stderr.write("usage: install-hints.mjs <sha>\n");

    return 1;
  }

  const sha = resolveCommit(arg);

  if (sha === null) {
    process.stderr.write(`install-hints: cannot read ${arg}\n`);

    return 1;
  }

  process.stdout.write(`${JSON.stringify(collectHints(sha), null, 2)}\n`);

  return 0;
}

process.exitCode = main();
