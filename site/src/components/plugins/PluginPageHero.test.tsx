import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { PluginPageHero } from "./PluginPageHero.tsx";

const SOURCE = "https://github.com/example/ai-toolkit/tree/main/laravel";
const PACKAGE = "https://www.npmjs.com/package/example";

function renderHero(packageUrl?: string): ReturnType<typeof render> {
  return render(
    <PluginPageHero
      accentClass="bg-plugin-laravel"
      chips={["MIT", "13 skills"]}
      name="laravel"
      packageUrl={packageUrl}
      sourceUrl={SOURCE}
      tagline="Conventions for `Laravel` apps."
      title="Laravel, by the book"
      version="1.2.3"
    >
      <p>install box</p>
    </PluginPageHero>,
  );
}

describe("PluginPageHero", () => {
  it("names the plugin in the page's only h1", async () => {
    await renderHero();

    await expect
      .element(page.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Laravel, by the book");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it("leads back to the plugins and marks the current crumb", async () => {
    await renderHero();

    await expect
      .element(page.getByRole("link", { name: "Plugins" }))
      .toHaveAttribute("href", "/#plugins");
    const current = document.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("laravel");
  });

  it("lists the plugin and version chips, then every given chip", async () => {
    const { container } = await renderHero();

    const chips = [...container.querySelectorAll("section ul > li")].map(
      (chip) => chip.textContent,
    );
    expect(chips).toEqual(["AI Toolkit plugin", "v1.2.3", "MIT", "13 skills"]);
  });

  it("links GitHub alone when the plugin has no package", async () => {
    await renderHero();

    await expect
      .element(page.getByRole("link", { name: /GitHub/ }))
      .toHaveAttribute("href", SOURCE);
    expect(page.getByRole("link", { name: /npm/ }).elements()).toHaveLength(0);
  });

  it("links GitHub and npm when the plugin has a package", async () => {
    await renderHero(PACKAGE);

    await expect
      .element(page.getByRole("link", { name: /GitHub/ }))
      .toHaveAttribute("href", SOURCE);
    await expect
      .element(page.getByRole("link", { name: /npm/ }))
      .toHaveAttribute("href", PACKAGE);
  });

  it("renders its children", async () => {
    await renderHero();

    await expect.element(page.getByText("install box")).toBeVisible();
  });
});
