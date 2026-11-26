import { existsSync } from "node:fs";
import { join } from "node:path";
import { compare } from "../sort.mjs";
import {
  ALL_CHANGES_NO_SUBMODULES,
  EVERY_FILE_NO_SUBMODULES,
  OPERATION_MARKERS,
  SHA,
} from "./constants.mjs";
import { refuse } from "./context.mjs";
import { showPath } from "./display.mjs";

export function currentHead(ctx) {
  const result = ctx.git.run(["rev-parse", "--verify", "--quiet", "HEAD"]);

  if (result.status !== 0 || !SHA.test(result.stdout.trim())) {
    refuse("no-commit", "the working tree has no commit yet");
  }

  return result.stdout.trim();
}

export function currentBranch(ctx) {
  const result = ctx.git.run(["symbolic-ref", "--quiet", "HEAD"]);

  return result.status === 0
    ? result.stdout.trim().replace(/^refs\/heads\//, "")
    : null;
}

export function requireCommit(ctx, sha) {
  if (!SHA.test(sha ?? "")) {
    refuse("bad-sha", `expected a 40-character commit sha, got ${sha}`);
  }

  const result = ctx.git.run([
    "rev-parse",
    "--verify",
    "--quiet",
    `${sha}^{commit}`,
  ]);

  if (result.status !== 0) {
    refuse("bad-sha", `${sha} is not a commit in this repository`);
  }
}

// The untracked setting is always passed: the user's
// `status.showUntrackedFiles` must not decide what counts as a change.
function statusRecords(ctx, { ignoreSubmodules, untracked }) {
  const args = [
    "status",
    "--porcelain",
    "-z",
    "--no-renames",
    `--untracked-files=${untracked === "all" ? "all" : untracked ? "normal" : "no"}`,
  ];

  if (ignoreSubmodules) {
    args.push("--ignore-submodules=all");
  }

  return ctx.git
    .text(args)
    .split("\0")
    .filter((record) => record !== "");
}

export function statusPaths(ctx, options) {
  return statusRecords(ctx, options).map((record) => showPath(record.slice(3)));
}

// What a restore leaves in the tree: untracked paths are not damage, but the
// person is told they stay.
export function untrackedPaths(ctx) {
  try {
    return statusRecords(ctx, ALL_CHANGES_NO_SUBMODULES)
      .filter((record) => record.startsWith("?? "))
      .map((record) => showPath(record.slice(3)))
      .sort(compare);
  } catch {
    return [];
  }
}

// Every untracked file, not directories, so a file written into a directory
// that was already untracked still shows as new.
export function untrackedFiles(ctx) {
  try {
    return statusRecords(ctx, EVERY_FILE_NO_SUBMODULES)
      .filter((record) => record.startsWith("?? "))
      .map((record) => showPath(record.slice(3)));
  } catch {
    return [];
  }
}

// A required clean filter that fails makes `git status` itself fail, so the
// callers that must not lose the id ask for a result instead of an exception.
export function tryStatusPaths(ctx, options) {
  try {
    return { paths: statusPaths(ctx, options) };
  } catch (error) {
    return { failed: showPath(String(error?.message ?? error)) };
  }
}

export function operationInProgress(ctx) {
  return OPERATION_MARKERS.find((name) => existsSync(join(ctx.gitDir, name)));
}
