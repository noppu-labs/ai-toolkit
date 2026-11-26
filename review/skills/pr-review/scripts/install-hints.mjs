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

import { findExecutable } from "./lib/exec.mjs";
import { makeGit } from "./lib/git.mjs";
import { collectHints } from "./lib/install-hints/collect.mjs";
import { resolveCommit } from "./lib/install-hints/commit.mjs";

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
