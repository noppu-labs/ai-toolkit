import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT: string = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SITE_URL = "https://toolkit.noppu.com";

function listSkillDirs(plugin: string): string[] {
  return readdirSync(join(REPO_ROOT, plugin, "skills"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function readHomepage(plugin: string): string {
  const raw = readFileSync(join(REPO_ROOT, plugin, "package.json"), "utf8");

  return (JSON.parse(raw) as { homepage: string }).homepage;
}

describe.each(["investigate", "review"])("%s README", (plugin) => {
  it(`links every ${plugin} skill to its page on the website`, () => {
    const readme = readFileSync(join(REPO_ROOT, plugin, "README.md"), "utf8");

    for (const dir of listSkillDirs(plugin)) {
      expect(readme).toContain(
        `[\`${plugin}:${dir}\`](${SITE_URL}/skills/${dir})`,
      );
    }
  });
});

describe("OpenCode package homepage", () => {
  it("sends the OpenCode packages' npm homepage to the website", () => {
    expect(readHomepage("investigate")).toBe(`${SITE_URL}/opencode`);
    expect(readHomepage("review")).toBe(`${SITE_URL}/opencode`);
  });
});

function readMarketplacePlugins(): string[] {
  const raw = readFileSync(
    join(REPO_ROOT, ".claude-plugin", "marketplace.json"),
    "utf8",
  );

  return (JSON.parse(raw) as { plugins: { name: string }[] }).plugins.map(
    (plugin) => plugin.name,
  );
}

const PLUGINS = readMarketplacePlugins();

describe("plugin links", () => {
  it("reads the plugins from the marketplace", () => {
    expect(PLUGINS.length).toBeGreaterThan(0);
  });

  it.each(PLUGINS)("links %s to its page in the README's table", (plugin) => {
    const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");

    expect(readme).toContain(`[\`${plugin}\`](${SITE_URL}/plugins/${plugin})`);
  });

  it("has no ?plugin= link left in the README", () => {
    expect(readFileSync(join(REPO_ROOT, "README.md"), "utf8")).not.toContain(
      "?plugin=",
    );
  });

  it.each(PLUGINS)("sends %s's plugin.json homepage to its page", (plugin) => {
    const manifest = JSON.parse(
      readFileSync(
        join(REPO_ROOT, plugin, ".claude-plugin", "plugin.json"),
        "utf8",
      ),
    ) as { homepage: string };

    expect(manifest.homepage).toBe(`${SITE_URL}/plugins/${plugin}`);
  });
});
