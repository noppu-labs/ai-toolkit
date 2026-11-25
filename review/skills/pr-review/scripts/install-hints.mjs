#!/usr/bin/env node
// Report what a commit's tree says about installing the project, as JSON.
//
// Usage: node install-hints.mjs <sha>   (run anywhere inside the repository)
//
// Reads the tree at <sha> through git, never the working tree. Shape:
// ../references/install-hints.schema.json. It decides nothing: the caller picks
// the install command. It lists only what it recognises, so an empty list is
// not proof that nothing runs: installHooks holds the hooks found in readable
// package.json and composer.json files outside vendor/ and node_modules/
// (workspace members run theirs on install), not everything an install can
// run. Files it would not read or list (symlinks, submodules, unreadable files,
// invalid JSON, unsafe paths) go to `skipped`. Manifest scripts and runtime
// pins are read only at the root and in lockfile directories; Makefile,
// justfile, Taskfile, setup scripts and docs only at the root.

import { posix } from "node:path";
import { findExecutable } from "./lib/exec.mjs";
import { makeGit } from "./lib/git.mjs";
import { recognisedLockfile } from "./lib/lockfiles.mjs";
import { dirOf, isSafePath, isVendored, pathIn } from "./lib/paths.mjs";
import { compare, sortBy } from "./lib/sort.mjs";
import { listTree, makeSource } from "./lib/tree.mjs";

const INSTALL_LIKE = /install|setup|bootstrap|init/i;
const DOCS_HEADING = /install|setup|getting started|bootstrap|init/i;
const REF_ARG = /^[^-\s][^\s]*$/;
const NPM_HOOKS = [
  "preinstall",
  "install",
  "postinstall",
  "preprepare",
  "prepare",
  "postprepare",
  "prepublish",
  "pnpm:devPreinstall",
];
const COMPOSER_HOOKS = [
  "pre-install-cmd",
  "post-install-cmd",
  "pre-autoload-dump",
  "post-autoload-dump",
  "init",
  "pre-command-run",
  "pre-file-download",
  "pre-operations-exec",
  "pre-package-install",
  "post-package-install",
];

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
const DOCS_FILES = ["README.md", "CONTRIBUTING.md", "CLAUDE.md", "AGENTS.md"];

function resolveCommit(git, arg) {
  if (!REF_ARG.test(arg)) {
    return null;
  }

  try {
    const sha = git.text([
      "rev-parse",
      "--verify",
      "--quiet",
      `${arg}^{commit}`,
    ]);

    return /^[0-9a-f]{40}$/.test(sha.trim()) ? sha.trim() : null;
  } catch {
    return null;
  }
}

function splitLines(text) {
  return text.split(/\r?\n/);
}

function parseJsonObject(text) {
  try {
    const value = JSON.parse(text.startsWith("\uFEFF") ? text.slice(1) : text);

    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

function findLockfiles(src) {
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

function uniqueSorted(names) {
  return [...new Set(names)].sort(compare);
}

function makeTargets(text) {
  const names = [];

  for (const line of splitLines(text)) {
    const match = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*::?(?![:=])/.exec(line);

    if (match !== null) {
      names.push(match[1]);
    }
  }

  return names;
}

function justRecipes(text) {
  const names = [];

  for (const line of splitLines(text)) {
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

  for (const line of splitLines(text)) {
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

function headingText(line) {
  let start = 0;

  while (start < 3 && line[start] === " ") {
    start += 1;
  }

  let end = start;

  while (line[end] === "#") {
    end += 1;
  }

  if (end === start || end - start > 6 || !/\s/.test(line.charAt(end))) {
    return "";
  }

  const text = line.slice(end).trim();
  let close = text.length;

  while (close > 0 && text[close - 1] === "#") {
    close -= 1;
  }

  const hasClosing =
    close < text.length && close > 0 && /\s/.test(text[close - 1]);

  return hasClosing ? text.slice(0, close).trim() : text;
}

function docsHeadings(text) {
  const names = [];
  let inFence = false;

  for (const line of splitLines(text)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    }

    const heading = inFence ? "" : headingText(line);

    if (heading && DOCS_HEADING.test(heading)) {
      names.push(heading);
    }
  }

  return names;
}

function findTaskEntries(src) {
  const entries = [];
  const kinds = [
    [MAKE_FILES, "make", makeTargets],
    [JUST_FILES, "just", justRecipes],
    [TASK_FILES, "task", taskNames],
  ];

  for (const [files, kind, extract] of kinds) {
    for (const path of files.filter((file) => src.has(file))) {
      const names = uniqueSorted(
        extract(src.read(path) ?? "").filter((name) => INSTALL_LIKE.test(name)),
      );

      if (names.length > 0) {
        entries.push({ path, kind, names });
      }
    }
  }

  return entries;
}

function findFileEntries(src) {
  const entries = [];

  for (const path of SCRIPT_FILES.filter((file) => src.has(file))) {
    if (src.admit(path)) {
      entries.push({ path, kind: "script-file", names: [] });
    }
  }

  for (const path of DOCS_FILES.filter((file) => src.has(file))) {
    const names = uniqueSorted(docsHeadings(src.read(path) ?? ""));

    if (names.length > 0) {
      entries.push({ path, kind: "docs-section", names });
    }
  }

  return entries;
}

function findRootEntries(src) {
  return [...findTaskEntries(src), ...findFileEntries(src)];
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

function readManifest(src, path, kind) {
  const text = src.read(path);

  if (text === null) {
    return null;
  }

  const json = parseJsonObject(text);
  const safe = isSafePath(path);

  if (json === null) {
    src.skip(path, "invalid-json");

    return null;
  }

  if (!safe) {
    src.skip(path, "unsafe-path");
  }

  return { path, kind: kind[1], hooks: kind[2], json, safe };
}

function readManifests(src) {
  const manifests = [];
  const kinds = [
    ["composer.json", "composer-script", COMPOSER_HOOKS],
    ["package.json", "npm-script", NPM_HOOKS],
  ];

  for (const path of src.paths()) {
    const kind = kinds.find(([file]) => posix.basename(path) === file);
    const manifest =
      kind === undefined || isVendored(path)
        ? null
        : readManifest(src, path, kind);

    if (manifest !== null) {
      manifests.push(manifest);
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

  for (const line of splitLines(text)) {
    const hash = line.indexOf("#");
    const body = hash === -1 ? line : line.slice(0, hash);
    const [tool, version] = body.trim().split(/\s+/);

    if (tool && version) {
      found.push({ tool, version });
    }
  }

  return found;
}

function findPinnedRuntimes(src, dir) {
  const found = [];
  const pins = [
    [".nvmrc", "node"],
    [".node-version", "node"],
    [".python-version", "python"],
  ];

  for (const [file, tool] of pins) {
    const version = src.read(pathIn(dir, file))?.trim();

    if (version) {
      found.push({ path: pathIn(dir, file), tool, version });
    }
  }

  const path = pathIn(dir, ".tool-versions");

  for (const entry of toolVersions(src.read(path) ?? "")) {
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

function findRuntimes(src, dirs, manifests) {
  const found = [
    ...dirs.flatMap((dir) => findPinnedRuntimes(src, dir)),
    ...findManifestRuntimes(manifests),
  ];

  return sortBy(found, "path", "tool", "version");
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

  return uniqueSorted(names).map((name) => ({
    name,
    onPath: findExecutable(name) !== null,
  }));
}

// A tracked `.env`, even a symlink, would take the copy `cp <example> .env`
// makes: through a symlink that writes to a file outside the tree.
function findEnvExample(src) {
  if (src.has(".env")) {
    return null;
  }

  return (
    [".env.example", ".env.dist"].find(
      (file) => src.has(file) && src.admit(file),
    ) ?? null
  );
}

function collectHints(git, sha) {
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

function main() {
  const found = findExecutable("git");

  if (found === null) {
    process.stderr.write("install-hints: git not found on PATH\n");

    return 1;
  }

  const git = makeGit(found);

  const arg = process.argv[2];

  if (arg === undefined || arg === "") {
    process.stderr.write("usage: install-hints.mjs <sha>\n");

    return 1;
  }

  const sha = resolveCommit(git, arg);

  if (sha === null) {
    process.stderr.write(`install-hints: cannot read ${arg}\n`);

    return 1;
  }

  process.stdout.write(`${JSON.stringify(collectHints(git, sha), null, 2)}\n`);

  return 0;
}

process.exitCode = main();
