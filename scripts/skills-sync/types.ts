// Shared types and constants for the skills sync tool.

export const PLUGINS: string[] = ["laravel", "inertia-react"];

export type SyncState =
  | "up-to-date"
  | "upstream-updated"
  | "locally-modified"
  | "diverged"
  | "local";

export interface UpstreamSource {
  source: string;
  ref: string;
  skillPath: string;
}

export interface LockEntry {
  sourceType?: string | undefined;
  source?: string | undefined;
  ref?: string | undefined;
  skillPath?: string | undefined;
  vendoredHash?: string | undefined;
  upstreamHash?: string | undefined;
  upstreamCommit?: string | undefined;
}

export interface LockFile {
  version: number;
  skills: Record<string, LockEntry>;
}

export interface UpstreamSnapshot {
  commit: string;
  files: Map<string, Buffer>;
  hash: string;
}

export type Fetcher = (entry: UpstreamSource) => UpstreamSnapshot;

export type GhApi = (path: string) => unknown;

export interface StatusRow {
  id: string;
  state: SyncState | `fetch-error (${string})`;
}
