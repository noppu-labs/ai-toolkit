import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { PluginEntry } from "@/catalog-types";
import { OPENCODE_PATH, opencodePluginPath } from "@/lib/opencode";
import type { OpenCodeCard } from "@/lib/opencode-cards";
import { FIXTURE_CATALOG, FIXTURE_REVIEW_PLUGIN } from "@/test/fixture-catalog";
import { MoreOpenCodePlugins } from "./MoreOpenCodePlugins.tsx";

const SYNCED: OpenCodeCard = {
  name: "synced-plugin",
  version: "1.0.0",
  summary: "A synced plugin",
  chips: [],
  command: "opencode plugin add synced-plugin",
  href: opencodePluginPath("synced-plugin"),
  accentClass: "bg-plugin-laravel",
};
const INERTIA_REACT = FIXTURE_CATALOG.plugins.find(
  (plugin) => plugin.name === "inertia-react",
);
const LARAVEL = FIXTURE_CATALOG.plugins.find(
  (plugin) => plugin.name === "laravel",
);

// Listed against the site's order on purpose: review ranks before inertia-react.
const TOOLKIT_PLUGINS: PluginEntry[] = [
  ...(INERTIA_REACT === undefined
    ? []
    : [{ ...INERTIA_REACT, opencodePackage: "@noppu-labs/opencode-inertia" }]),
  FIXTURE_REVIEW_PLUGIN,
  ...(LARAVEL === undefined ? [] : [LARAVEL]),
];

function renderList(): ReturnType<typeof render> {
  return render(
    <MoreOpenCodePlugins plugins={[SYNCED]} toolkitPlugins={TOOLKIT_PLUGINS} />,
  );
}

describe("MoreOpenCodePlugins", () => {
  it("heads the list with More OpenCode plugins", async () => {
    await renderList();

    await expect
      .element(page.getByRole("heading", { level: 2 }))
      .toHaveTextContent("More OpenCode plugins");
  });

  it("lists the synced card first, then the toolkit plugins with an OpenCode package in the site's order", async () => {
    await renderList();

    const names = page
      .getByRole("list")
      .getByRole("link")
      .elements()
      .map((link) => link.textContent);

    expect(names).toHaveLength(3);
    expect(names[0]).toContain("synced-plugin");
    expect(names[1]).toContain("review");
    expect(names[2]).toContain("inertia-react");
    expect(names.join("")).not.toContain("laravel");
  });

  it("links each toolkit row to the OpenCode hub and the synced row to its own page", async () => {
    await renderList();

    const hrefs = page
      .getByRole("list")
      .getByRole("link")
      .elements()
      .map((link) => link.getAttribute("href"));

    expect(hrefs).toEqual([SYNCED.href, OPENCODE_PATH, OPENCODE_PATH]);
  });

  it("ends with a link to all OpenCode plugins", async () => {
    await renderList();

    await expect
      .element(page.getByRole("link", { name: "All OpenCode plugins" }))
      .toHaveAttribute("href", OPENCODE_PATH);
  });
});
