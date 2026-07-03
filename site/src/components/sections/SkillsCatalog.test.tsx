import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { FIXTURE_CATALOG } from "../../test/fixture-catalog.ts";
import { SkillsCatalog } from "./SkillsCatalog.tsx";

describe("SkillsCatalog", () => {
  it("renders every skill grouped by plugin with source links", async () => {
    render(<SkillsCatalog plugins={FIXTURE_CATALOG.plugins} />);

    await expect
      .element(page.getByText("laravel-dtos", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByText("laravel-enums", { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByText("shadcn", { exact: true }))
      .toBeVisible();

    const link = page.getByRole("link", { name: "laravel-dtos" });
    await expect
      .element(link)
      .toHaveAttribute(
        "href",
        "https://github.com/noppu-labs/ai-toolkit/blob/main/laravel/skills/laravel-dtos/SKILL.md",
      );
  });

  it("filters by name and description, case-insensitively", async () => {
    render(<SkillsCatalog plugins={FIXTURE_CATALOG.plugins} />);

    await page.getByRole("textbox", { name: "Filter skills" }).fill("SPATIE");

    await expect.element(page.getByText("laravel-dtos")).toBeVisible();
    await expect
      .element(page.getByText("laravel-enums"))
      .not.toBeInTheDocument();
    await expect.element(page.getByText("shadcn")).not.toBeInTheDocument();
  });

  it("shows an empty state and clears the filter", async () => {
    render(<SkillsCatalog plugins={FIXTURE_CATALOG.plugins} />);

    await page.getByRole("textbox", { name: "Filter skills" }).fill("zzzzzz");
    await expect
      .element(page.getByText("No skills match your filter."))
      .toBeVisible();

    await page.getByRole("button", { name: "Clear filter" }).click();
    await expect.element(page.getByText("laravel-enums")).toBeVisible();
  });
});
