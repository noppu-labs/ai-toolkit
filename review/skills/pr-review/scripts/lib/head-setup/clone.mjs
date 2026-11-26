import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { makeGit } from "../git.mjs";
import { changeTree } from "./checkout-enter.mjs";
import { ALL_CHANGES, SAFE_GIT } from "./constants.mjs";
import { refuse } from "./context.mjs";
import { showPath } from "./display.mjs";
import { FORGET_HINT } from "./printed-commands.mjs";
import {
  abandonScratch,
  describeCloneProblem,
  makeScratch,
  recordScratch,
  removeScratch,
  resolveRoot,
} from "./scratch.mjs";
import { tryStatusPaths } from "./status.mjs";

function originUrl(ctx) {
  const result = ctx.git.run(["config", "--get", "remote.origin.url"]);
  const url = result.status === 0 ? result.stdout.trim() : "";

  if (url === "" || url.startsWith("-")) {
    return null;
  }

  return existsSync(resolve(ctx.top, url)) ? resolve(ctx.top, url) : url;
}

function cloneInto(ctx, entry) {
  const common = ctx.git
    .text(["rev-parse", "--path-format=absolute", "--git-common-dir"])
    .trim();
  const cloned = changeTree(ctx, [
    "clone",
    "--shared",
    "--no-checkout",
    common,
    entry.path,
  ]);

  if (cloned.status !== 0) {
    return cloned;
  }

  const inside = makeGit(ctx.gitPath, entry.path);
  const switched = inside.run([
    ...SAFE_GIT,
    "switch",
    "--detach",
    entry.headSha,
  ]);
  const url = originUrl(ctx);

  if (switched.status === 0 && url !== null) {
    inside.run(["remote", "set-url", "origin", url]);
  }

  return switched.status === 0 ? requireCompleteClone(inside) : switched;
}

// A clone of a source that lacks objects can switch without error and leave
// files missing; a full status with untracked files catches that.
function requireCompleteClone(inside) {
  const status = tryStatusPaths({ git: inside }, ALL_CHANGES);

  if (status.failed === undefined && status.paths.length === 0) {
    return { status: 0, stderr: "" };
  }

  const detail =
    status.failed === undefined
      ? `the clone differs from the head after the switch (${status.paths.length} paths)`
      : `git status failed in the clone after the switch (${status.failed})`;

  return { status: 1, stderr: detail };
}

function isTrue(value) {
  return ["true", "yes", "on", "1"].includes(value.trim().toLowerCase());
}

function hasPromisorRemote(ctx) {
  const remotes = ctx.git.run([
    "config",
    "--get-regexp",
    "^remote\\..*\\.promisor$",
  ]);
  const flagged = remotes.stdout
    .split("\n")
    .some((line) => isTrue(line.slice(line.lastIndexOf(" ") + 1)));

  return (
    flagged ||
    ctx.git.run(["config", "--get", "extensions.partialClone"]).status === 0
  );
}

// `--shared` borrows the source's objects, so a source that lacks some would
// give a clone that cannot hold the head.
function requireFullSource(ctx) {
  const shallow = ctx.git.run(["rev-parse", "--is-shallow-repository"]);

  if (shallow.status === 0 && shallow.stdout.trim() === "true") {
    refuse(
      "shallow-source",
      "the repository is a shallow clone; run `git fetch --unshallow` or use a worktree",
    );
  }

  if (hasPromisorRemote(ctx)) {
    refuse(
      "partial-source",
      "the repository is a partial clone; fetch its missing objects or use a worktree",
    );
  }
}

export function enterClone(ctx, sha, entries, requested) {
  requireFullSource(ctx);

  const scratch = makeScratch(
    entries,
    "clone",
    sha,
    resolveRoot(ctx, requested),
  );

  recordScratch(ctx, scratch);

  const result = cloneInto(ctx, scratch.entry);

  if (result.status !== 0) {
    abandonScratch(ctx, scratch.entry, showPath(result.stderr.trim()));
  }

  return {
    ok: true,
    id: scratch.entry.id,
    kind: "clone",
    headSha: sha,
    path: scratch.entry.path,
  };
}

export function restoreClone(_ctx, entry) {
  if (!existsSync(entry.parent)) {
    return { restored: { missing: true } };
  }

  const problem = describeCloneProblem(entry);

  if (problem !== null) {
    return {
      declined: { reason: "not-ours", detail: `${problem}${FORGET_HINT}` },
    };
  }

  removeScratch(entry);

  return { restored: {} };
}
