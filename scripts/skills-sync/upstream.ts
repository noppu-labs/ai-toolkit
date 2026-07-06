// Fetching upstream skill snapshots from GitHub via the gh CLI.
import { execFileSync } from "node:child_process";
import { hashFiles } from "./hashing.ts";
import type { GhApi, UpstreamSnapshot, UpstreamSource } from "./types.ts";

export function fetchGhJson(path: string): unknown {
  const stdout = execFileSync("gh", ["api", path], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  return JSON.parse(stdout);
}

interface GhCommit {
  sha: string;
}

interface GhContentItem {
  type: string;
  path: string;
  sha: string;
}

interface GhBlob {
  content: string;
}

export function fetchUpstream(
  entry: UpstreamSource,
  gh: GhApi = fetchGhJson,
): UpstreamSnapshot {
  const commit = (gh(`repos/${entry.source}/commits/${entry.ref}`) as GhCommit)
    .sha;
  const files = new Map<string, Buffer>();

  const walk = (path: string): void => {
    for (const item of gh(
      `repos/${entry.source}/contents/${path}?ref=${commit}`,
    ) as GhContentItem[]) {
      if (item.type === "dir") {
        walk(item.path);
      } else if (item.type === "file") {
        const blob = gh(
          `repos/${entry.source}/git/blobs/${item.sha}`,
        ) as GhBlob;

        files.set(
          item.path.slice(entry.skillPath.length + 1),
          Buffer.from(blob.content, "base64"),
        );
      }
    }
  };

  walk(entry.skillPath);

  if (files.size === 0) {
    throw new Error(
      `no files under ${entry.skillPath} in ${entry.source}@${entry.ref}`,
    );
  }

  return { commit, files, hash: hashFiles(files) };
}
