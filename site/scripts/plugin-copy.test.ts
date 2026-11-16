import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { copyTexts } from "../src/lib/plugin-page-schema.ts";
import { SKILL_SUMMARIES } from "../src/lib/skill-summaries.ts";
import { FIXTURE_PLUGIN_COPY } from "../src/test/plugin-copy.ts";
import { buildCatalog } from "./build-catalog.ts";
import { PLUGIN_COPY_DIR, readPluginCopy } from "./plugin-copy.ts";

const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(siteDir, "..");
const COPY = readPluginCopy(siteDir);
const CATALOG = buildCatalog(repoRoot);

function sentences(texts: string[]): string[] {
  return texts.flatMap((text) =>
    text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim().toLowerCase()),
  );
}

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

describe("the authored copy", () => {
  it.each(["review", "investigate"])(
    "%s: the copy is valid and its own",
    (name) => {
      const copy = COPY.find((entry) => entry.name === name)?.copy;
      const plugin = CATALOG.plugins.find((entry) => entry.name === name);

      if (copy === undefined || plugin === undefined) {
        throw new Error(`no copy or no catalog plugin named ${name}`);
      }

      const texts = copyTexts(copy);
      const taken = sentences([
        plugin.description,
        CATALOG.marketplaceDescription,
        ...Object.values(SKILL_SUMMARIES[name] ?? {}),
      ]);

      // No sentence of 40 characters or more is lifted from text the site already shows.
      expect(
        sentences(texts).filter((s) => s.length >= 40 && taken.includes(s)),
      ).toEqual([]);
      // No em or en dash.
      expect(texts.filter((text) => /[–—]/.test(text))).toEqual([]);
      expect(copy.seo.title).not.toMatch(/AI Toolkit/i);
    },
  );
});
