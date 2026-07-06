import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect } from "vitest";
import { hashFiles } from "./hashing.ts";
import { makeGithubEntry } from "./test-helpers.ts";
import { fetchGhJson, fetchUpstream } from "./upstream.ts";

const SHA256_HEX = /^[0-9a-f]{64}$/;

describe("fetchGhJson", () => {
  it("shells out to gh api and parses the JSON response", (t) => {
    const binDir = mkdtempSync(join(tmpdir(), "fake-gh-"));
    const originalPath = process.env.PATH;

    t.onTestFinished(() => {
      process.env.PATH = originalPath;
      rmSync(binDir, { recursive: true, force: true });
    });

    // A fake `gh` executable that echoes its arguments back as JSON, so the
    // test exercises the real execFileSync + JSON.parse path offline.
    writeFileSync(
      join(binDir, "gh"),
      `#!/bin/sh\nprintf '{"argv":"%s"}' "$*"\n`,
      { mode: 0o755 },
    );
    process.env.PATH = `${binDir}:${originalPath}`;

    expect(fetchGhJson("repos/o/r/commits/main")).toEqual({
      argv: "api repos/o/r/commits/main",
    });
  });
});

describe("fetchUpstream", () => {
  it("throws when the upstream skill path contains no files", () => {
    const gh = (path: string): unknown =>
      path.includes("/commits/") ? { sha: "abc999" } : [];

    expect(() => fetchUpstream(makeGithubEntry(), gh)).toThrow(
      /no files under skills\/demo/,
    );
  });

  it("walks directories via the gh contents API", () => {
    const toBase64 = (s: string): string => Buffer.from(s).toString("base64");
    const responses: Record<string, unknown> = {
      "repos/owner/repo/commits/main": { sha: "abc999" },
      "repos/owner/repo/contents/skills/demo?ref=abc999": [
        { type: "file", path: "skills/demo/SKILL.md", sha: "blob1" },
        { type: "dir", path: "skills/demo/references" },
      ],
      "repos/owner/repo/contents/skills/demo/references?ref=abc999": [
        { type: "file", path: "skills/demo/references/a.md", sha: "blob2" },
      ],
      "repos/owner/repo/git/blobs/blob1": { content: toBase64("# demo") },
      "repos/owner/repo/git/blobs/blob2": { content: toBase64("ref a") },
    };
    const gh = (path: string): unknown => {
      if (!(path in responses)) throw new Error(`unexpected gh call: ${path}`);

      return responses[path];
    };

    const result = fetchUpstream(makeGithubEntry(), gh);

    expect(result.commit).toBe("abc999");
    expect([...result.files.keys()].sort()).toEqual([
      "SKILL.md",
      "references/a.md",
    ]);
    expect(result.files.get("SKILL.md")?.toString()).toBe("# demo");
    expect(result.hash).toBe(hashFiles(result.files));
  });

  // Property: arbitrary (hostile) upstream listings and blob payloads still
  // produce a well-formed snapshot — no crash, valid sha256 digest.
  it.prop([fc.string({ minLength: 1 }), fc.string()])(
    "tolerates arbitrary upstream listings and blobs",
    (name, content) => {
      const hostileGh = (path: string): unknown => {
        if (path.includes("/commits/")) {
          return { sha: "0000000000000000000000000000000000000000" };
        }

        if (path.includes("/contents/")) {
          return [{ path: `s/${name}`, sha: "b1", type: "file" }];
        }

        return { content };
      };

      const result = fetchUpstream(
        { ref: "main", skillPath: "s", source: "o/r" },
        hostileGh,
      );

      return result.files.size === 1 && SHA256_HEX.test(result.hash);
    },
  );
});
