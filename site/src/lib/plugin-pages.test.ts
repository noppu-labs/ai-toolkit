import { describe, expect, it } from "vitest";
import { FIXTURE_CATALOG } from "@/test/fixture-catalog";
import { joinPluginPages, morePluginRows } from "./plugin-pages.ts";
import { sortPlugins } from "./plugins.ts";

describe("joinPluginPages", () => {
  const entries = FIXTURE_CATALOG.plugins.map((plugin) => ({
    id: plugin.name,
    data: plugin.name,
  }));

  it("pairs each plugin with its copy, in the site's plugin order", () => {
    const pages = joinPluginPages(
      FIXTURE_CATALOG.plugins,
      [...entries].reverse(),
    );

    expect(pages.map((page) => page.plugin.name)).toEqual(
      sortPlugins(FIXTURE_CATALOG.plugins).map((plugin) => plugin.name),
    );
    expect(pages.every((page) => page.copy === page.plugin.name)).toBe(true);
  });

  it("throws, naming the plugin, when a plugin has no copy", () => {
    expect(() =>
      joinPluginPages(FIXTURE_CATALOG.plugins, entries.slice(1)),
    ).toThrow(`plugins collection and the catalog disagree: ${entries[0]?.id}`);
  });

  it("throws, naming the copy, when copy has no plugin", () => {
    expect(() =>
      joinPluginPages(FIXTURE_CATALOG.plugins, [
        ...entries,
        { id: "ghost", data: "ghost" },
      ]),
    ).toThrow("plugins collection and the catalog disagree: ghost");
  });
});

describe("morePluginRows", () => {
  it("lists every other plugin, linking to its page", () => {
    const rows = morePluginRows(FIXTURE_CATALOG.plugins, "laravel");

    expect(rows.map((row) => row.name)).not.toContain("laravel");
    expect(rows).toHaveLength(FIXTURE_CATALOG.plugins.length - 1);
    expect(rows.every((row) => row.href === `/plugins/${row.name}`)).toBe(true);
  });
});
