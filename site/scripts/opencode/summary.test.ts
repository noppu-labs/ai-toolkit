import { describe, expect, it } from "vitest";
import { commitOf, sha256 } from "./fixtures.ts";
import { syncSummary } from "./summary.ts";

const enc = new TextEncoder();
const source = {
  repo: "noppu-labs/opencode-x",
  package: "@noppu-labs/opencode-x",
};

function synced(
  version: string,
  commit: string,
  files: Record<string, string>,
): { repo: string; package: string; [key: string]: unknown } {
  return {
    ...source,
    version,
    tag: `v${version}`,
    commit,
    license: "MIT",
    files: Object.fromEntries(
      Object.entries(files).map(([path, body]) => [
        path,
        sha256(enc.encode(body)),
      ]),
    ),
  };
}

describe("syncSummary", () => {
  it("lists a new plugin and an updated plugin", () => {
    const before = {
      lockfileVersion: 1 as const,
      plugins: {
        "opencode-x": synced("1.0.0", commitOf("a"), {
          "docs/a": "1",
          "docs/b": "1",
        }),
        "opencode-y": source,
        "opencode-same": synced("2.0.0", commitOf("c"), { "docs/a": "1" }),
      },
    };
    const after = {
      lockfileVersion: 1 as const,
      plugins: {
        "opencode-x": synced("1.1.0", commitOf("b"), {
          "docs/a": "2",
          "docs/b": "1",
          "docs/c": "1",
        }),
        "opencode-y": synced("0.1.0", commitOf("d"), { "docs/a": "1" }),
        "opencode-same": before.plugins["opencode-same"],
      },
    };
    const lines = syncSummary(before, after).split("\n");
    expect(lines[0]).toBe(
      "Synced OpenCode plugin pages from their npm releases.",
    );
    expect(lines).toContain("| plugin | from | to | changed files |");
    expect(lines).toContain(
      "| opencode-x | 1.0.0@aaaaaaa | 1.1.0@bbbbbbb | 2 |",
    );
    expect(lines).toContain("| opencode-y | new | 0.1.0@ddddddd | 1 |");
    expect(lines.join("\n")).not.toContain("opencode-same");
  });
});
