import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { FIXTURE_PLUGIN_COPY } from "../src/test/plugin-copy.ts";
import { PLUGIN_COPY_DIR, readPluginCopy } from "./plugin-copy.ts";

function makeSiteDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "plugin-copy-"));
  mkdirSync(join(dir, PLUGIN_COPY_DIR), { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(dir, PLUGIN_COPY_DIR, file), stringify(content));
  }

  return dir;
}

describe("readPluginCopy", () => {
  it("returns nothing when the directory is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "plugin-copy-"));

    expect(readPluginCopy(dir)).toEqual([]);
  });

  it("returns the parsed manifests sorted by name", () => {
    const dir = makeSiteDir({
      "b.yaml": FIXTURE_PLUGIN_COPY,
      "a.yaml": FIXTURE_PLUGIN_COPY,
    });

    expect(readPluginCopy(dir).map((plugin) => plugin.name)).toEqual([
      "a",
      "b",
    ]);
  });

  it("names the file that fails validation", () => {
    const { tagline: _tagline, ...rest } = FIXTURE_PLUGIN_COPY;
    const dir = makeSiteDir({ "bad.yaml": rest });

    expect(() => readPluginCopy(dir)).toThrow(/bad\.yaml/);
  });
});
