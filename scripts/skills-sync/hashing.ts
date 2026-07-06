// Content hashing over skill directories. Sync state is classified from two
// whole-directory hashes (vendored copy vs upstream), so these digests must be
// stable across platforms and resistant to path-injection collisions.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function listFiles(dir: string, base: string = dir): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...listFiles(full, base));
    } else if (entry.isFile()) {
      out.push(relative(base, full).replaceAll("\\", "/"));
    }
  }

  return out.sort();
}

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  return a > b ? 1 : 0;
}

export function hashFiles(files: Map<string, Buffer>): string {
  // Hash the path too: raw paths could contain ":" or "\n", letting two
  // different file sets serialize to the same digest input.
  const lines = [...files.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([path, content]) => `${sha256(path)}:${sha256(content)}`);

  return sha256(lines.join("\n"));
}

export function hashDirectory(dir: string): string {
  const files = new Map<string, Buffer>();

  for (const rel of listFiles(dir)) {
    files.set(rel, readFileSync(join(dir, rel)));
  }

  return hashFiles(files);
}
