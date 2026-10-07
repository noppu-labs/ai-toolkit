import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ThemeSync } from "@/components/ThemeSync";
import { LOGO_FACE_SRC } from "@/lib/assets";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import { resetPreferences } from "@/test/preferences";
import { SiteHeader } from "./SiteHeader.tsx";

const SECTIONS = ["Install", "Plugins", "Skills", "Security"] as const;

function renderHeader(): void {
  render(
    <>
      <ThemeSync />
      <SiteHeader />
    </>,
  );
}

const menuButton = page.getByRole("button", { name: /^(Open|Close) menu$/ });
const menu = page.getByRole("dialog", { name: "Menu" });

beforeEach(() => {
  resetPreferences();
  usePreferencesStore.getState().setTheme("light");
});

afterEach(() => {
  resetPreferences();
});

describe("SiteHeader", () => {
  it("links the brand back to the top of the page", async () => {
    renderHeader();

    await expect
      .element(page.getByRole("link", { name: /^AI Toolkit/ }))
      .toHaveAttribute("href", "#top");
  });

  it("shows the face mark in the brand link", async () => {
    renderHeader();

    const brand = page.getByRole("link", { name: /^AI Toolkit/ });
    await expect.element(brand).toBeVisible();
    expect(brand.element().querySelector("img")).toHaveAttribute(
      "src",
      LOGO_FACE_SRC,
    );
  });

  it("toggles the theme", async () => {
    renderHeader();

    await page.getByRole("button", { name: "Switch to dark theme" }).click();

    await expect
      .poll(() => document.documentElement.classList.contains("dark"))
      .toBe(true);
  });

  it.each([
    [390, 64],
    [1280, 78],
  ])(
    "is as tall as the sections' scroll margin at %ipx wide",
    async (width, height) => {
      await page.viewport(width, 800);
      renderHeader();
      const header = page.getByRole("banner");
      await expect.element(header).toBeVisible();

      expect(header.element().getBoundingClientRect().height).toBe(height);
      expect(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--header-height")
          .trim(),
      ).toBe(`${height / 16}rem`);
    },
  );
});

describe("SiteHeader on wide screens", () => {
  beforeEach(async () => {
    await page.viewport(1280, 800);
  });

  it("links to each section inline and hides the menu button", async () => {
    renderHeader();

    const nav = page.getByRole("navigation", { name: "Main" });
    await expect.element(nav).toBeVisible();
    const hrefs = SECTIONS.map((name) =>
      nav
        .getByRole("link", { name, exact: true })
        .element()
        .getAttribute("href"),
    );
    expect(hrefs).toEqual(["#install", "#plugins", "#skills", "#security"]);
    await expect.element(menuButton).not.toBeInTheDocument();
  });

  it("names the maker under the brand", async () => {
    renderHeader();

    await expect
      .element(page.getByRole("link", { name: "AI Toolkit by Noppu Labs" }))
      .toBeVisible();
  });

  it("links to the GitHub repository with the mark, hidden from screen readers", async () => {
    renderHeader();

    const link = page.getByRole("link", { name: "GitHub" });
    await expect
      .element(link)
      .toHaveAttribute("href", "https://github.com/noppu-labs/ai-toolkit");
    const mark = link.element().querySelector("svg");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveAttribute("fill", "currentColor");
  });

  it("gives the GitHub link the 3px main-colour shadow", async () => {
    renderHeader();

    const link = page.getByRole("link", { name: "GitHub" });
    await expect.element(link).toBeVisible();
    const shadow = getComputedStyle(link.element()).boxShadow;
    expect(shadow).toContain("3px 3px 0px 0px");
    expect(shadow).not.toContain("4px 4px");
  });

  it("wraps rather than clipping when text-only zoom enlarges the row", async () => {
    await page.viewport(768, 800);
    // Text-only zoom raises rem but leaves the `md` media query matching.
    document.documentElement.style.fontSize = "24px";
    try {
      renderHeader();
      const github = page.getByRole("link", { name: "GitHub" });
      await expect.element(github).toBeVisible();

      expect(
        github.element().getBoundingClientRect().right,
      ).toBeLessThanOrEqual(window.innerWidth);
      const header = page.getByRole("banner").element();
      expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth);
    } finally {
      document.documentElement.style.fontSize = "";
      await page.viewport(1280, 800);
    }
  });

  it("keeps every control at least 44px tall", async () => {
    renderHeader();
    await expect
      .element(page.getByRole("button", { name: "Switch to dark theme" }))
      .toBeVisible();

    const controls = [
      ...page.getByRole("navigation").getByRole("link").elements(),
      page.getByRole("button", { name: "Switch to dark theme" }).element(),
      page.getByRole("link", { name: "GitHub" }).element(),
    ];
    expect(controls).toHaveLength(6);
    for (const control of controls) {
      expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("SiteHeader on phones", () => {
  beforeEach(async () => {
    await page.viewport(390, 844);
  });

  it("fits the brand, theme toggle and menu button in one row", async () => {
    renderHeader();

    await expect.element(menuButton).toBeVisible();
    const brand = page.getByRole("link", { name: "AI Toolkit" });
    const theme = page.getByRole("button", { name: "Switch to dark theme" });
    await expect.element(brand).toBeVisible();
    await expect
      .element(page.getByRole("navigation", { name: "Main" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("link", { name: "GitHub" }))
      .not.toBeInTheDocument();

    const tops = [brand, theme, menuButton].map(
      (locator) => locator.element().getBoundingClientRect().top,
    );
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(4);
    for (const control of [theme, menuButton]) {
      expect(control.element().getBoundingClientRect().height).toBe(44);
    }
  });

  it("opens the menu with numbered section links and a GitHub button", async () => {
    renderHeader();

    await expect.element(menuButton).toHaveAttribute("aria-expanded", "false");
    await menuButton.click();

    await expect.element(menu).toBeVisible();
    await expect.element(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect
      .element(menuButton)
      .toHaveAttribute("aria-controls", menu.element().id);
    await expect
      .element(page.getByRole("button", { name: "Close menu" }))
      .toBeVisible();

    const links = menu
      .getByRole("navigation", { name: "Main" })
      .getByRole("link")
      .elements();
    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["01Install", "#install"],
      ["02Plugins", "#plugins"],
      ["03Skills", "#skills"],
      ["04Security", "#security"],
    ]);
    for (const link of links) {
      expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(56);
    }
    await expect
      .element(menu.getByRole("link", { name: "View on GitHub" }))
      .toHaveAttribute("href", "https://github.com/noppu-labs/ai-toolkit");
    // The theme toggle stays in the header.
    expect(menu.getByRole("button").elements()).toHaveLength(0);
  });

  it("drops the menu from under the header, full width", async () => {
    renderHeader();

    await menuButton.click();
    await expect.element(menu).toBeVisible();

    const header = page.getByRole("banner").element().getBoundingClientRect();
    const popup = menu.element().getBoundingClientRect();
    expect(Math.round(popup.top)).toBe(Math.round(header.bottom));
    expect(popup.left).toBe(0);
    expect(popup.width).toBe(window.innerWidth);
  });

  it("closes on Escape and returns focus to the menu button", async () => {
    renderHeader();

    await menuButton.click();
    await expect.element(menu).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(menu).not.toBeInTheDocument();
    await expect.element(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect.element(menuButton).toHaveFocus();
  });

  it("closes when a link is followed, and the next Tab starts in its section", async () => {
    render(
      <>
        <SiteHeader />
        {/* biome-ignore lint/correctness/useUniqueElementIds: stands in for the plugins section. */}
        <section id="plugins">
          <button type="button">In the section</button>
        </section>
      </>,
    );

    await menuButton.click();
    await menu.getByRole("link", { name: /Plugins/ }).click();

    await expect.element(menu).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#plugins");
    await expect.element(menuButton).not.toHaveFocus();
    await userEvent.tab();
    await expect
      .element(page.getByRole("button", { name: "In the section" }))
      .toHaveFocus();
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("closes when the window widens past the menu's breakpoint", async () => {
    renderHeader();

    await menuButton.click();
    await expect.element(menu).toBeVisible();
    await page.viewport(1280, 800);

    await expect.element(menu).not.toBeInTheDocument();
  });

  it("closes on a click outside the menu", async () => {
    renderHeader();

    await menuButton.click();
    await expect.element(menu).toBeVisible();
    await userEvent.click(document.body, { position: { x: 200, y: 700 } });

    await expect.element(menu).not.toBeInTheDocument();
  });

  it("does not lock the page scroll while open", async () => {
    renderHeader();

    await menuButton.click();
    await expect.element(menu).toBeVisible();

    expect(getComputedStyle(document.documentElement).overflow).not.toBe(
      "hidden",
    );
    expect(getComputedStyle(document.body).overflow).not.toBe("hidden");
  });
});
