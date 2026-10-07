import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { readPluginParam, writePluginParam } from "@/lib/url-state";
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

// Paints the colours bottom-up on a 1px canvas and reads back the composite sRGB.
function paint(...colors: string[]): number[] {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("No 2D canvas context");
  }
  for (const color of colors) {
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
  }

  return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}

function luminance(rgb: number[]): number {
  const [r = 0, g = 0, b = 0] = rgb.map((value) => {
    const channel = value / 255;

    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

// WCAG 1.4.11 asks 3:1 of a control's boundary against the section behind it.
function borderContrast(element: Element): number {
  const section = element.closest("section");
  if (section === null) {
    throw new Error("No enclosing section");
  }
  const outer = getComputedStyle(section).backgroundColor;
  const style = getComputedStyle(element);

  return contrast(
    paint(outer, style.backgroundColor, style.borderTopColor),
    paint(outer),
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
  writePluginParam(null);
});

describe("SkillsCatalog", () => {
  it("keeps the search box and unpressed chip borders at 3:1 in dark mode", async () => {
    document.documentElement.classList.add("dark");
    render(<SkillsCatalog plugins={PLUGINS} />);
    await expect.element(search).toBeVisible();

    expect(borderContrast(search.element())).toBeGreaterThanOrEqual(3);
    expect(borderContrast(chip("laravel").element())).toBeGreaterThanOrEqual(3);
  });

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

  it("announces how many skills the filter shows", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    const status = page.getByRole("status");
    await expect.element(status).toHaveTextContent("4 skills shown");
    await chip("laravel").click();
    await expect.element(status).toHaveTextContent("2 skills shown");
    await search.fill("backed");
    await expect.element(status).toHaveTextContent("1 skill shown");
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

  it("preselects the plugin named in the URL", async () => {
    writePluginParam("laravel");
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect
      .element(chip("laravel"))
      .toHaveAttribute("aria-pressed", "true");
    expect(skillNames()).toEqual(["laravel-dtos", "laravel-enums"]);
  });

  it("follows the URL when a link elsewhere sets the plugin", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");

    writePluginParam("inertia-react");

    await expect
      .element(chip("inertia-react"))
      .toHaveAttribute("aria-pressed", "true");
    expect(skillNames()).toEqual(["shadcn"]);
  });

  it("ignores an unknown plugin in the URL", async () => {
    writePluginParam("no-such-plugin");
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");
    expect(skillNames()).toHaveLength(4);
  });

  it("keeps the URL in step with the chips", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await chip("review").click();
    expect(readPluginParam()).toBe("review");

    await chip("all").click();
    expect(readPluginParam()).toBeNull();
  });
});
