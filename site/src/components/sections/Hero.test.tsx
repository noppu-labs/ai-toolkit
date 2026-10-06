import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { FIXTURE_CATALOG } from "../../test/fixture-catalog.ts";
import { Band } from "./Band.tsx";
import { Hero } from "./Hero.tsx";

function renderHero(description = "x"): void {
  render(<Hero description={description} pluginCount={2} skillCount={3} />);
}

describe("Hero", () => {
  it("renders the only level-one heading with the tagline", async () => {
    renderHero();

    const heading = page.getByRole("heading", { level: 1 });
    await expect
      .element(heading)
      .toHaveTextContent(
        "Agent skills for deep code review and grounded investigation.",
      );
    expect(page.getByRole("heading", { level: 1 }).all()).toHaveLength(1);
  });

  it("shows the marketplace description from the catalog", async () => {
    renderHero(FIXTURE_CATALOG.marketplaceDescription);

    await expect
      .element(page.getByText("Test marketplace description"))
      .toBeVisible();
  });

  it("links the calls to action to the install and skills sections", async () => {
    renderHero();

    await expect
      .element(page.getByRole("link", { name: "Install the plugins" }))
      .toHaveAttribute("href", "#install");
    await expect
      .element(page.getByRole("link", { name: "Browse 3 skills" }))
      .toHaveAttribute("href", "#skills");
  });

  it("captions the mascot with the plugin count", async () => {
    renderHero();

    const mascot = page.getByRole("img", { name: /axolotl/ });
    await expect.element(mascot).toBeVisible();
    await expect
      .element(mascot)
      .toHaveAttribute("src", `${import.meta.env.BASE_URL}logo.png`);
    await expect
      .element(page.getByText("2 plugins", { exact: true }))
      .toBeVisible();
  });

  it("is the #top anchor, labelled by its heading", async () => {
    renderHero();

    await expect
      .element(page.getByRole("region", { name: /Agent skills for/ }))
      .toHaveAttribute("id", "top");
  });
});

describe("Band", () => {
  it("is decorative and shows the skill count", async () => {
    const { container } = await render(<Band skillCount={42} />);

    const band = container.firstElementChild;
    expect(band?.getAttribute("aria-hidden")).toBe("true");
    expect(band?.textContent).toContain("42 skills");
  });

  it("does not widen the page", async () => {
    await page.viewport(375, 667);
    await render(<Band skillCount={42} />);

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    );
  });
});
