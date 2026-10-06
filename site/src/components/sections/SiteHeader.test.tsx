import { ThemeProvider } from "next-themes";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { LOGO_FACE_SRC } from "@/lib/assets";
import { SiteHeader } from "./SiteHeader.tsx";

function renderHeader(): void {
  render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <SiteHeader />
    </ThemeProvider>,
  );
}

afterEach(() => {
  window.localStorage.removeItem("theme");
  document.documentElement.classList.remove("dark");
});

describe("SiteHeader", () => {
  it("links the brand back to the top of the page", async () => {
    renderHeader();

    await expect
      .element(page.getByRole("link", { name: "AI Toolkit by Noppu Labs" }))
      .toHaveAttribute("href", "#top");
  });

  it("shows the face mark in the brand link", async () => {
    renderHeader();

    const brand = page.getByRole("link", { name: "AI Toolkit by Noppu Labs" });
    await expect.element(brand).toBeVisible();
    expect(brand.element().querySelector("img")).toHaveAttribute(
      "src",
      LOGO_FACE_SRC,
    );
  });

  it("links to each section in the main navigation", async () => {
    renderHeader();

    const nav = page.getByRole("navigation", { name: "Main" });
    await expect.element(nav).toBeVisible();
    const hrefs = ["Plugins", "Skills", "Security"].map((name) =>
      nav
        .getByRole("link", { name, exact: true })
        .element()
        .getAttribute("href"),
    );
    expect(hrefs).toEqual(["#plugins", "#skills", "#security"]);
  });

  it("links to the GitHub repository", async () => {
    renderHeader();

    await expect
      .element(page.getByRole("link", { name: "GitHub" }))
      .toHaveAttribute("href", "https://github.com/noppu-labs/ai-toolkit");
  });

  it("gives the GitHub link the 3px main-colour shadow", async () => {
    renderHeader();

    const link = page.getByRole("link", { name: "GitHub" });
    await expect.element(link).toBeVisible();
    const shadow = getComputedStyle(link.element()).boxShadow;
    expect(shadow).toContain("3px 3px 0px 0px");
    expect(shadow).not.toContain("4px 4px");
  });

  it("toggles the theme", async () => {
    window.localStorage.setItem("theme", "light");
    renderHeader();

    await page.getByRole("button", { name: "Toggle theme" }).click();

    await expect
      .poll(() => document.documentElement.classList.contains("dark"))
      .toBe(true);
  });

  it("keeps every control at least 44px tall", async () => {
    renderHeader();
    await expect
      .element(page.getByRole("button", { name: "Toggle theme" }))
      .toBeVisible();

    const controls = [
      ...page.getByRole("navigation").getByRole("link").elements(),
      page.getByRole("button", { name: "Toggle theme" }).element(),
    ];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  });
});
