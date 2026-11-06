import { describe, expect, it } from "vitest";
import {
  githubRepoUrl,
  joinOpenCodePlugins,
  npmPackageUrl,
  OPENCODE_PATH,
  opencodePluginPath,
} from "./opencode.ts";
import type { OpenCodeLock } from "./opencode-lock.ts";

function lockEntry(name: string): OpenCodeLock["plugins"][string] {
  return {
    repo: `noppu-labs/${name}`,
    package: `@noppu-labs/${name}`,
    version: "1.2.3",
    tag: "v1.2.3",
    commit: "a".repeat(40),
    license: "MIT",
    files: {},
  };
}

function lockOf(...names: string[]): OpenCodeLock {
  return {
    lockfileVersion: 1,
    plugins: Object.fromEntries(names.map((n) => [n, lockEntry(n)])),
  };
}

describe("opencode urls", () => {
  it("builds the hub, plugin, npm and GitHub URLs", () => {
    expect(OPENCODE_PATH).toBe("/opencode");
    expect(opencodePluginPath("opencode-cache-manager")).toBe(
      "/opencode/opencode-cache-manager",
    );
    expect(npmPackageUrl("@noppu-labs/opencode-x")).toBe(
      "https://www.npmjs.com/package/@noppu-labs/opencode-x",
    );
    expect(githubRepoUrl("noppu-labs/opencode-x")).toBe(
      "https://github.com/noppu-labs/opencode-x",
    );
  });
});

describe("joinOpenCodePlugins", () => {
  it("joins pages to the lock and puts the permission reviewer first", () => {
    const joined = joinOpenCodePlugins(
      [
        { id: "opencode-cache-manager", data: "cache" },
        { id: "opencode-permission-reviewer", data: "reviewer" },
      ],
      lockOf("opencode-cache-manager", "opencode-permission-reviewer"),
    );
    expect(joined.map((p) => p.name)).toEqual([
      "opencode-permission-reviewer",
      "opencode-cache-manager",
    ]);
    expect(joined[0]).toEqual({
      name: "opencode-permission-reviewer",
      repo: "noppu-labs/opencode-permission-reviewer",
      package: "@noppu-labs/opencode-permission-reviewer",
      version: "1.2.3",
      license: "MIT",
      page: "reviewer",
    });
  });

  it("sorts plugins outside the fixed order by name, after it", () => {
    const joined = joinOpenCodePlugins(
      [
        { id: "opencode-zed", data: 1 },
        { id: "opencode-cache-manager", data: 2 },
        { id: "opencode-alpha", data: 3 },
      ],
      lockOf("opencode-zed", "opencode-cache-manager", "opencode-alpha"),
    );
    expect(joined.map((p) => p.name)).toEqual([
      "opencode-cache-manager",
      "opencode-alpha",
      "opencode-zed",
    ]);
  });

  it("throws when the lock has a plugin with no entry", () => {
    expect(() =>
      joinOpenCodePlugins(
        [{ id: "opencode-cache-manager", data: 1 }],
        lockOf("opencode-cache-manager", "opencode-gone"),
      ),
    ).toThrow(
      "opencode collection and opencode-lock.json disagree: opencode-gone",
    );
  });

  it("throws when an entry has no lock", () => {
    expect(() =>
      joinOpenCodePlugins(
        [
          { id: "opencode-cache-manager", data: 1 },
          { id: "opencode-extra", data: 2 },
        ],
        lockOf("opencode-cache-manager"),
      ),
    ).toThrow(
      "opencode collection and opencode-lock.json disagree: opencode-extra",
    );
  });
});
