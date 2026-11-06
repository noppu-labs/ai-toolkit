import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkContent } from "./content.ts";
import { readLock } from "./lockfile.ts";

const SITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Entries pinned to a `ref` pass here; CI's `sync:opencode -- --check` step is
// the one that requires every plugin to be on its release tag.
describe("the committed OpenCode content", () => {
  it("matches the lock's hashes and holds no file the lock leaves out", () => {
    expect(checkContent(SITE_DIR, readLock(SITE_DIR))).toEqual([]);
  });
});
