import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { PluginEntry } from "../../catalog-types.ts";
import {
  FIXTURE_CATALOG,
  FIXTURE_REVIEW_PLUGIN,
} from "../../test/fixture-catalog.ts";
import { PluginCards } from "./PluginCards.tsx";

const PLUGINS: PluginEntry[] = [
  ...FIXTURE_CATALOG.plugins,
  FIXTURE_REVIEW_PLUGIN,
];

function chipsOf(name: string): string[] {
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  return card
    .getByRole("list", { name: "Contents" })
    .getByRole("listitem")
    .elements()
    .map((item) => item.textContent ?? "");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PluginCards", () => {
  it("is a section labelled by its heading", async () => {
    render(<PluginCards plugins={PLUGINS} />);

    await expect
      .element(
        page.getByRole("region", {
          name: "Review anywhere. Go deep on your stack.",
        }),
      )
      .toHaveAttribute("id", "plugins");
  });

  it("shows the plugins in the site order, not the input order", async () => {
    render(<PluginCards plugins={PLUGINS} />);

    await expect
      .element(page.getByRole("heading", { name: "review", exact: true }))
      .toBeVisible();
    const names = page
      .getByRole("heading", { level: 3 })
      .elements()
      .map((heading) => heading.textContent);
    expect(names).toEqual(["review", "laravel", "inertia-react"]);
  });

  it("renders the version and the non-zero counts as chips", async () => {
    render(<PluginCards plugins={PLUGINS} />);

    await expect.element(page.getByText("v0.1.3")).toBeVisible();
    await expect.element(page.getByText("v0.8.1")).toBeVisible();
    expect(chipsOf("laravel")).toEqual(["2 skills", "1 agent", "4 rules"]);
    expect(chipsOf("inertia-react")).toEqual(["1 skill", "1 agent", "2 rules"]);
    // No agents or rules: those chips are left out, and review works anywhere.
    expect(chipsOf("review")).toEqual(["1 skill", "any language"]);
  });

  it("copies a plugin's install command", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(<PluginCards plugins={PLUGINS} />);

    await expect
      .element(page.getByText("/plugin install laravel@ai-toolkit"))
      .toBeVisible();
    await page
      .getByRole("button", { name: "Copy install command for laravel" })
      .click();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      "/plugin install laravel@ai-toolkit",
    );
  });
});
