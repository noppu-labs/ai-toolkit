/** A full commit SHA, which is what Workers Builds and GitHub name a commit by. */
export function isCommitSha(value: string | undefined): value is string {
  return value !== undefined && /^[0-9a-f]{40}$/.test(value);
}

/**
 * The commit Workers Builds is building, which the page names in its
 * `build-commit` meta so the preview checks know which commit a preview serves.
 * `null` on any other build.
 */
export function buildCommit(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const sha = env.WORKERS_CI_COMMIT_SHA;
  return isCommitSha(sha) ? sha : null;
}
