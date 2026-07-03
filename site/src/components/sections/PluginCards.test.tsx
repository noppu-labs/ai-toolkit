import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { FIXTURE_CATALOG } from "../../test/fixture-catalog.ts";
import { PluginCards } from "./PluginCards.tsx";

describe("PluginCards", () => {
  it("renders a card per plugin with version and counts", async () => {
    render(<PluginCards plugins={FIXTURE_CATALOG.plugins} />);

    await expect
      .element(page.getByRole("heading", { name: "laravel" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: "inertia-react" }))
      .toBeVisible();
    await expect.element(page.getByText("v0.1.3")).toBeVisible();
    await expect
      .element(page.getByText("2 skills · 1 agent · 4 rules"))
      .toBeVisible();
    await expect
      .element(page.getByText("1 skill · 1 agent · 2 rules"))
      .toBeVisible();
  });
});
