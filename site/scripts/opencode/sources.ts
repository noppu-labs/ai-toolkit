import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "astro/zod";

export type Fetcher = typeof fetch;
export type GitRunner = (args: readonly string[]) => Promise<string>;

export const MAX_FILE_BYTES = 1_048_576;

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SHORT_COMMIT_LENGTH = 7;
const NPM_REGISTRY = "https://registry.npmjs.org";
const distTagsSchema = z.object({ latest: z.string().min(1) });
const execFileAsync = promisify(execFile);

/** The `latest` dist-tag of an npm package. */
export async function npmLatestVersion(
  pkg: string,
  fetcher: Fetcher,
): Promise<string> {
  const url = `${NPM_REGISTRY}/-/package/${pkg.replace("/", "%2F")}/dist-tags`;
  const response = await fetcher(url);
  if (response.status !== 200) {
    throw new Error(`${pkg}: npm registry returned ${response.status}`);
  }
  return distTagsSchema.parse(await response.json()).latest;
}

function refCommit(lines: readonly string[], ref: string): string | undefined {
  const match = lines.find((line) => line.endsWith(`\t${ref}`));
  return match?.split("\t")[0];
}

/** The commit a tag, a branch or a commit hash names. */
export async function resolveCommit(
  repo: string,
  ref: string,
  git: GitRunner,
): Promise<string> {
  if (COMMIT_PATTERN.test(ref)) {
    return ref;
  }
  const output = await git([
    "ls-remote",
    `https://github.com/${repo}`,
    `refs/tags/${ref}`,
    `refs/tags/${ref}^{}`,
    `refs/heads/${ref}`,
  ]);
  const lines = output.split("\n");
  const commit =
    refCommit(lines, `refs/tags/${ref}^{}`) ??
    refCommit(lines, `refs/tags/${ref}`) ??
    refCommit(lines, `refs/heads/${ref}`);
  if (commit === undefined) {
    throw new Error(`${repo}: no tag or branch named ${ref}`);
  }
  return commit;
}

/** A file of a repo at a commit, as raw bytes. */
export async function fetchRepoFile(
  repo: string,
  commit: string,
  path: string,
  fetcher: Fetcher,
): Promise<Uint8Array> {
  const response = await fetcher(
    `https://raw.githubusercontent.com/${repo}/${commit}/${path}`,
  );
  if (response.status !== 200) {
    throw new Error(
      `${repo}@${commit.slice(0, SHORT_COMMIT_LENGTH)}: ${path} returned ${response.status}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) {
    throw new Error(`${repo}: ${path} is over 1 MiB`);
  }
  return bytes;
}

export const defaultGit: GitRunner = async (
  args: readonly string[],
): Promise<string> => {
  const { stdout } = await execFileAsync("git", [...args]);
  return stdout;
};
