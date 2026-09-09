import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLUGINS } from "./types.ts";

const root = join(import.meta.dirname, "..", "..");

describe("PLUGINS", () => {
  it("matches the plugins declared in marketplace.json", () => {
    const marketplace = JSON.parse(
      readFileSync(join(root, ".claude-plugin", "marketplace.json"), "utf8"),
    ) as { plugins: { name: string }[] };

    expect([...PLUGINS].sort()).toEqual(
      marketplace.plugins.map((p) => p.name).sort(),
    );
  });

  it("names a directory with a plugin manifest and a skills lock", () => {
    for (const plugin of PLUGINS) {
      expect(
        existsSync(join(root, plugin, ".claude-plugin", "plugin.json")),
      ).toBe(true);
      expect(existsSync(join(root, plugin, "skills-lock.json"))).toBe(true);
    }
  });
});
