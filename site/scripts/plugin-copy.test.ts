import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import {
  MARKETPLACE_ADD_COMMAND,
  pluginInstallHosts,
} from "../src/lib/install-methods.ts";
import { copyTexts } from "../src/lib/plugin-page-schema.ts";
import { SKILL_SUMMARIES } from "../src/lib/skill-summaries.ts";
import { FIXTURE_PLUGIN_COPY } from "../src/test/plugin-copy.ts";
import { buildCatalog } from "./build-catalog.ts";
import { PLUGIN_COPY_DIR, readPluginCopy } from "./plugin-copy.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(siteDir, "..");
const COPY = readPluginCopy(siteDir);
const CATALOG = buildCatalog(repoRoot);

const NUMBER_WORDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];

/**
 * A count of a plugin's parts: a number, then at most one word, then skill, rule or agent.
 * The number may not follow a letter, digit, dot or hyphen, so rule ids such as `PHP-1` and
 * versions such as `2.1.248` do not count.
 */
const COUNT_OF_PARTS = new RegExp(
  `(?<![\\w.-])(?:\\d+|${NUMBER_WORDS.join("|")})(?:\\s+[\\w-]+)?\\s+(?:skills?|rules?|agents?)\\b`,
  "i",
);

function sentences(texts: string[]): string[] {
  return texts.flatMap((text) =>
    text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim().toLowerCase()),
  );
}

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

describe("the authored copy", () => {
  it.each(["review", "investigate", "laravel", "inertia-react"])(
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

      // The install box shows the commands; the copy never spells them out.
      const commands = [
        MARKETPLACE_ADD_COMMAND,
        ...pluginInstallHosts(plugin).flatMap((host) => host.commands),
      ];
      expect(
        texts.filter((text) =>
          commands.some((command) => text.includes(command)),
        ),
      ).toEqual([]);

      // The chips show the counts, so the copy cannot drift from them.
      expect(texts.filter((text) => COUNT_OF_PARTS.test(text))).toEqual([]);
    },
  );
});

describe("COUNT_OF_PARTS", () => {
  it.each([
    "Sixteen skills for Laravel backends",
    "with 6 skills, an agent and 2 rules",
    "It lists 16 backend skills",
    "`typescript-react-patterns` has 33 rules across 7 categories",
    "One rule covers Duster",
    "sends two agents the same prompt",
  ])("catches %j", (text) => {
    expect(text).toMatch(COUNT_OF_PARTS);
  });

  it.each([
    "against numbered rules (`PHP-1` to `PHP-5`, `TS-1` to `TS-4`)",
    "`PHP-5` rules",
    "Laravel 13. `laravel-testing` covers Pest 4 and PHPUnit 12.",
    "Claude Code 2.1.248 rules",
    "two foreground `subagent` calls",
    "the skills and its rules",
  ])("leaves %j alone", (text) => {
    expect(text).not.toMatch(COUNT_OF_PARTS);
  });
});
