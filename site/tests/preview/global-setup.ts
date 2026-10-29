import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import type { TestProject } from "vitest/node";
import { isCommitSha } from "../../src/lib/build-info.ts";

declare module "vitest" {
  export interface ProvidedContext {
    /** The preview's origin, with no trailing slash. */
    previewUrl: string;
    /** Whether the preview serves a commit other than `EXPECTED_COMMIT`, which the tests then skip. */
    previewIsNewer: boolean;
  }
}

/** How long to wait for the preview to serve `EXPECTED_COMMIT`. */
const POLL_WINDOW_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;
const REQUEST_TIMEOUT_MS = 10_000;

/** What the preview's home page showed on one poll. */
interface Seen {
  /** The `build-commit` meta's content, or `null` when the page has none. */
  commit: string | null;
  /** Why there was no commit, for the failure message. */
  problem: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is empty: set it to run the preview checks`);
  }
  return value;
}

/** The `content` of the page's `build-commit` meta. */
function metaCommit(html: string): string | null {
  const tag = /<meta\b[^>]*\bname="build-commit"[^>]*>/.exec(html)?.[0];
  return (tag && /\bcontent="([^"]*)"/.exec(tag)?.[1]) ?? null;
}

async function readCommit(previewUrl: string): Promise<Seen> {
  try {
    const response = await fetch(`${previewUrl}/`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const commit = metaCommit(await response.text());
    return {
      commit,
      problem: `/ answered ${response.status} with no build-commit meta`,
    };
  } catch (error) {
    return { commit: null, problem: `/ could not be fetched: ${error}` };
  }
}

/** Polls until the preview serves `expected` or the window closes, and returns the last answer. */
async function waitForCommit(
  previewUrl: string,
  expected: string,
  deadline: number,
): Promise<Seen> {
  const seen = await readCommit(previewUrl);
  if (seen.commit === expected || Date.now() >= deadline) {
    return seen;
  }
  await sleep(POLL_INTERVAL_MS);
  return waitForCommit(previewUrl, expected, deadline);
}

/**
 * Records the commit the preview serves in the file `PREVIEW_COMMIT_FILE`
 * names, if set, whether or not it is `EXPECTED_COMMIT`. The workflow reports
 * a passing run as tested only when this commit is `EXPECTED_COMMIT`, and as a
 * skip only when it is ahead of it.
 */
async function recordCommit(commit: string): Promise<void> {
  const file = process.env.PREVIEW_COMMIT_FILE?.trim();
  if (file) {
    await writeFile(file, commit);
  }
}

/**
 * Finds out which commit the preview serves, so the tests judge the commit
 * under test: they run when it matches, skip when the preview serves another
 * commit, and the run fails when the page names no valid commit.
 */
export default async function setup(project: TestProject): Promise<void> {
  const previewUrl = requiredEnv("PREVIEW_URL").replace(/\/+$/, "");
  const expected = requiredEnv("EXPECTED_COMMIT");
  // An abbreviated SHA would never match, and every test would skip.
  if (!isCommitSha(expected)) {
    throw new Error(
      `EXPECTED_COMMIT is not a full 40-character commit SHA: ${expected}`,
    );
  }

  const seen = await waitForCommit(
    previewUrl,
    expected,
    Date.now() + POLL_WINDOW_MS,
  );
  if (seen.commit !== null && !isCommitSha(seen.commit)) {
    throw new Error(
      `${previewUrl}/ has a malformed build-commit meta: ${JSON.stringify(seen.commit)}`,
    );
  }
  if (seen.commit === null) {
    throw new Error(`${previewUrl}${seen.problem}`);
  }
  await recordCommit(seen.commit);
  project.provide("previewUrl", previewUrl);
  project.provide("previewIsNewer", seen.commit !== expected);
}
