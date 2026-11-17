import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { PluginLinkRow } from "@/lib/plugin-pages";
import { PluginLinkList } from "./PluginLinkList.tsx";

const rows: PluginLinkRow[] = [
  {
    name: "laravel",
    summary: "Laravel skills",
    href: "/plugins/laravel",
    accentClass: "bg-plugin-laravel",
  },
  {
    name: "review",
    summary: "Review skills",
    href: "/plugins/review",
    accentClass: "bg-plugin-review",
  },
];

function renderList(): ReturnType<typeof render> {
  return render(
    <PluginLinkList
      allHref="/#plugins"
      allLabel="All plugins"
      heading="More plugins"
      rows={rows}
    />,
  );
}

describe("PluginLinkList", () => {
  it("heads the list with an h2 of the given text", async () => {
    await renderList();

    await expect
      .element(page.getByRole("heading", { level: 2 }))
      .toHaveTextContent("More plugins");
  });

  it("links each row to its href", async () => {
    await renderList();

    const hrefs = page
      .getByRole("link")
      .elements()
      .map((link) => link.getAttribute("href"));
    expect(hrefs.slice(0, rows.length)).toEqual(rows.map((row) => row.href));
  });

  it("ends with a link to the full list", async () => {
    await renderList();

    await expect
      .element(page.getByRole("link", { name: "All plugins" }))
      .toHaveAttribute("href", "/#plugins");
  });
});
