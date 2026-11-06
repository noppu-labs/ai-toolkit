import {
  type LockEntry,
  type LockSources,
  lockEntrySchema,
} from "../../src/lib/opencode-lock.ts";

const SHORT_COMMIT_LENGTH = 7;

type Source = LockSources["plugins"][string];

function synced(source: Source | undefined): LockEntry | undefined {
  const parsed = lockEntrySchema.safeParse(source);
  return parsed.success ? parsed.data : undefined;
}

/** `1.2.3@abcdef1`, or the ref for a preview; `new` before the first sync. */
export function entryLabel(source: Source | undefined): string {
  const entry = synced(source);
  if (entry === undefined) {
    return "new";
  }
  return `${entry.ref ?? entry.version}@${entry.commit.slice(0, SHORT_COMMIT_LENGTH)}`;
}

function changedFiles(
  before: Source | undefined,
  after: Source | undefined,
): number {
  const was = synced(before)?.files ?? {};
  const now = synced(after)?.files ?? {};
  const paths = new Set([...Object.keys(was), ...Object.keys(now)]);
  return [...paths].filter((path) => was[path] !== now[path]).length;
}

/** A Markdown description of what a sync changed. */
export function syncSummary(before: LockSources, after: LockSources): string {
  const rows = Object.entries(after.plugins)
    .filter(
      ([name, entry]) =>
        entryLabel(before.plugins[name]) !== entryLabel(entry) ||
        changedFiles(before.plugins[name], entry) > 0,
    )
    .map(([name, entry]) => {
      const was = before.plugins[name];
      return `| ${name} | ${entryLabel(was)} | ${entryLabel(entry)} | ${changedFiles(was, entry)} |`;
    });
  return [
    "Synced OpenCode plugin pages from their npm releases.",
    "",
    "| plugin | from | to | changed files |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
