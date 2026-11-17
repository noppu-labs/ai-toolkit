import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { FIXTURE_PLUGIN_COPY } from "../src/test/plugin-copy.ts";
import { PLUGIN_COPY_DIR, readPluginCopy } from "./plugin-copy.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeSiteDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "plugin-copy-"));
  dirs.push(dir);
  mkdirSync(join(dir, PLUGIN_COPY_DIR), { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(dir, PLUGIN_COPY_DIR, file), stringify(content));
  }

  return dir;
}

describe("readPluginCopy", () => {
  it("returns nothing when the directory is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "plugin-copy-"));
    dirs.push(dir);

    expect(readPluginCopy(dir)).toEqual([]);
  });

  it("returns the parsed manifests sorted by name", () => {
    const dir = makeSiteDir({
      "B.yaml": FIXTURE_PLUGIN_COPY,
      "a.yaml": FIXTURE_PLUGIN_COPY,
    });

    expect(readPluginCopy(dir).map((plugin) => plugin.name)).toEqual([
      "a",
      "B",
    ]);
  });

  it("names the file that fails validation", () => {
    const { tagline: _tagline, ...rest } = FIXTURE_PLUGIN_COPY;
    const dir = makeSiteDir({ "bad.yaml": rest });

    expect(() => readPluginCopy(dir)).toThrow(/bad\.yaml/);
    expect(() => readPluginCopy(dir)).toThrow(/^bad\.yaml:\n/);
    expect(() => readPluginCopy(dir)).toThrow(/→ at tagline/);
    expect(() => readPluginCopy(dir)).not.toThrow(/"code":/);
  });

  it("names the file that is not valid YAML", () => {
    const dir = makeSiteDir({});
    writeFileSync(
      join(dir, PLUGIN_COPY_DIR, "broken.yaml"),
      "title: [unclosed\n",
    );

    expect(() => readPluginCopy(dir)).toThrow(/^broken\.yaml: /);
  });
});
