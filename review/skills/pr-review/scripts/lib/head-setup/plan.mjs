import { existsSync } from "node:fs";
import { join } from "node:path";
import { dirOf } from "../paths.mjs";
import { compare, sortBy } from "../sort.mjs";
import {
  ALL_CHANGES,
  DEPENDENCY_NAMES,
  SESSION_PATHSPECS,
} from "./constants.mjs";
import { refuse } from "./context.mjs";
import { showPath } from "./display.mjs";
import { listLockfiles } from "./lockfile-changes.mjs";
import { describeRecord, isCheckoutEntry } from "./record.mjs";
import { loadRecord } from "./record-store.mjs";
import {
  currentBranch,
  currentHead,
  operationInProgress,
  requireCommit,
  statusPaths,
} from "./status.mjs";

function dependenciesOf(ctx, path, manager) {
  const names = DEPENDENCY_NAMES.get(manager);

  if (names === undefined) {
    return "unknown";
  }

  const dir = join(ctx.top, dirOf(path));

  return names.some((name) => existsSync(join(dir, name)))
    ? "present"
    : "missing";
}

function planLockfiles(ctx, current, sha) {
  const found = [];

  for (const [path, { manager, blob }] of listLockfiles(ctx.git, sha)) {
    found.push({
      path,
      manager,
      changed: current.get(path)?.blob !== blob,
      dependencies: dependenciesOf(ctx, path, manager),
    });
  }

  return sortBy(found, "path");
}

function sessionConfigPaths(ctx, currentSha, sha) {
  const output = ctx.git.text([
    "diff",
    "--name-only",
    "--no-renames",
    "--no-ext-diff",
    "-z",
    currentSha,
    sha,
    "--",
    ...SESSION_PATHSPECS,
  ]);

  return output
    .split("\0")
    .filter((path) => path !== "")
    .sort(compare)
    .map(showPath);
}

function planCheckout(ctx, entries, problem, clean, atTarget) {
  const recorded = problem !== undefined || entries.some(isCheckoutEntry);

  if (recorded) {
    return { offered: false, reason: "recorded" };
  }

  if (atTarget) {
    return { offered: false, reason: "at-head" };
  }

  const busy = !clean || operationInProgress(ctx) !== undefined;

  return { offered: !busy, reason: busy ? "dirty" : null };
}

export function runPlan(ctx, shas) {
  if (shas.length === 0) {
    refuse("usage", "plan needs at least one head sha");
  }

  for (const sha of shas) {
    requireCommit(ctx, sha);
  }

  const treeSha = currentHead(ctx);
  const current = listLockfiles(ctx.git, treeSha);
  const loaded = loadRecord(ctx);
  const clean = statusPaths(ctx, ALL_CHANGES).length === 0;

  return {
    ok: true,
    treeSha,
    branch: currentBranch(ctx),
    clean,
    checkout: planCheckout(
      ctx,
      loaded.entries ?? [],
      loaded.problem,
      clean,
      shas.at(-1) === treeSha,
    ),
    record: describeRecord(loaded),
    heads: shas.map((sha) => ({
      headSha: sha,
      atTree: sha === treeSha,
      lockfiles: planLockfiles(ctx, current, sha),
      sessionConfig: sessionConfigPaths(ctx, treeSha, sha),
    })),
  };
}
