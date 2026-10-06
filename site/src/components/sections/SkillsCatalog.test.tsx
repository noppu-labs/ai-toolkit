import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { PluginEntry } from "../../catalog-types.ts";
import {
  FIXTURE_CATALOG,
  FIXTURE_REVIEW_PLUGIN,
} from "../../test/fixture-catalog.ts";
import { SkillsCatalog } from "./SkillsCatalog.tsx";

const PLUGINS: PluginEntry[] = [
  ...FIXTURE_CATALOG.plugins,
  FIXTURE_REVIEW_PLUGIN,
];

const search = page.getByRole("searchbox", { name: "Filter skills" });
const chips = page.getByRole("group", { name: "Filter by plugin" });

function chip(name: string): ReturnType<typeof page.getByRole> {
  return chips.getByRole("button", { name: new RegExp(`^${name} \\d+$`) });
}

function skillNames(): string[] {
  return page
    .getByRole("heading", { level: 3 })
    .elements()
    .map((heading) => heading.textContent ?? "");
}

describe("SkillsCatalog", () => {
  it("renders every skill in the site order with source links", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect
      .element(page.getByRole("region", { name: "The whole catalog." }))
      .toHaveAttribute("id", "skills");
    await expect
      .element(page.getByRole("link", { name: "laravel-dtos" }))
      .toHaveAttribute(
        "href",
        "https://github.com/noppu-labs/ai-toolkit/blob/main/laravel/skills/laravel-dtos/SKILL.md",
      );
    expect(skillNames()).toEqual([
      "comment-audit",
      "laravel-dtos",
      "laravel-enums",
      "shadcn",
    ]);
  });

  it("shows a chip per plugin with live counts, all pressed first", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");
    const labels = chips
      .getByRole("button")
      .elements()
      .map((button) => button.textContent);
    expect(labels).toEqual([
      "all 4",
      "review 1",
      "laravel 2",
      "inertia-react 1",
    ]);

    await search.fill("laravel");
    await expect.element(chip("all")).toHaveTextContent("all 2");
    await expect.element(chip("laravel")).toHaveTextContent("laravel 2");
    await expect.element(chip("review")).toHaveTextContent("review 0");
  });

  it("filters by name and description, case-insensitively", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await search.fill("SPATIE");

    await expect.element(page.getByText("laravel-dtos")).toBeVisible();
    await expect
      .element(page.getByText("laravel-enums"))
      .not.toBeInTheDocument();
    await expect.element(page.getByText("shadcn")).not.toBeInTheDocument();
  });

  it("filters by plugin chip and keeps a chip pressed", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await chip("inertia-react").click();
    await expect
      .element(chip("inertia-react"))
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "false");
    expect(skillNames()).toEqual(["shadcn"]);

    // Pressing the active chip again must not leave the group empty.
    await chip("inertia-react").click();
    await expect
      .element(chip("inertia-react"))
      .toHaveAttribute("aria-pressed", "true");
    expect(skillNames()).toEqual(["shadcn"]);

    await chip("all").click();
    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");
    await chip("all").click();
    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");
    expect(skillNames()).toHaveLength(4);
  });

  it("combines the query with the plugin chip", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await chip("laravel").click();
    await search.fill("backed");
    expect(skillNames()).toEqual(["laravel-enums"]);
  });

  it("shows an empty state and clears both the query and the chip", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await chip("review").click();
    await search.fill("spatie");
    await expect
      .element(page.getByText("No skills match your filter."))
      .toBeVisible();

    await page.getByRole("button", { name: "Clear filter" }).click();
    await expect.element(search).toHaveValue("");
    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");
    await expect.element(page.getByText("laravel-enums")).toBeVisible();
    expect(skillNames()).toHaveLength(4);
  });
});
