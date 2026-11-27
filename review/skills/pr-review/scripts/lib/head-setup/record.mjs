import { basename, dirname, isAbsolute, join } from "node:path";
import { HEAD_DIR, KINDS, SCRATCH_PREFIX, SHA, UUID } from "./constants.mjs";
import { isValidBranch } from "./display.mjs";

function describeProblem(entry) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return "an entry is not an object";
  }

  if (typeof entry.id !== "string" || !UUID.test(entry.id)) {
    return "an entry has no valid id";
  }

  if (!KINDS.includes(entry.kind)) {
    return `entry ${entry.id} has an unknown kind`;
  }

  if (!SHA.test(entry.headSha)) {
    return `entry ${entry.id} has no valid head sha`;
  }

  return entry.kind === "checkout"
    ? describeCheckoutProblem(entry)
    : describeScratchProblem(entry);
}

function describeCheckoutProblem(entry) {
  if (!SHA.test(entry.fromSha)) {
    return `entry ${entry.id} has no valid sha to return to`;
  }

  if (entry.branch !== null && !isValidBranch(entry.branch)) {
    return `entry ${entry.id} has an unusable branch name`;
  }

  if (entry.incomplete !== undefined && entry.incomplete !== true) {
    return `entry ${entry.id} has an unusable incomplete mark`;
  }

  return null;
}

function describeScratchProblem(entry) {
  const paths = [entry.root, entry.path, entry.parent];

  if (!paths.every((path) => typeof path === "string" && isAbsolute(path))) {
    return `entry ${entry.id} has a path that is not absolute`;
  }

  if (
    entry.path !== join(entry.parent, HEAD_DIR) ||
    dirname(entry.parent) !== entry.root ||
    !basename(entry.parent).startsWith(SCRATCH_PREFIX)
  ) {
    return `entry ${entry.id} has a path outside a ${SCRATCH_PREFIX}* directory inside its root`;
  }

  return null;
}

export function parseRecord(text) {
  let value = null;

  try {
    value = JSON.parse(text);
  } catch {
    return { problem: "the record is not valid JSON" };
  }

  if (value === null || typeof value !== "object" || value.version !== 1) {
    return { problem: "the record has another version" };
  }

  if (!Array.isArray(value.entries)) {
    return { problem: "the record has no entries list" };
  }

  const problem = value.entries.map(describeProblem).find((found) => found);

  return problem === undefined ? { entries: value.entries } : { problem };
}

export function isCheckoutEntry(entry) {
  return entry.kind === "checkout";
}

export function describeRecord(loaded) {
  if (loaded.problem !== undefined) {
    return { unreadable: true, detail: loaded.problem };
  }

  return loaded.entries.length === 0 ? null : { entries: loaded.entries };
}
