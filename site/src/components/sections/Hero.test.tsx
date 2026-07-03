import { ThemeProvider } from "next-themes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { FIXTURE_CATALOG } from "../../test/fixture-catalog.ts";
import { Hero } from "./Hero.tsx";

function renderHero(description: string): void {
  render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <Hero description={description} />
    </ThemeProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.removeItem("theme");
  document.documentElement.classList.remove("dark");
});

describe("Hero", () => {
  it("renders the project name and description", async () => {
    renderHero(FIXTURE_CATALOG.marketplaceDescription);

    await expect
      .element(page.getByRole("heading", { level: 1 }))
      .toHaveTextContent("AI Toolkit");
    await expect
      .element(page.getByText("Test marketplace description"))
      .toBeVisible();
  });

  it("shows both install paths", async () => {
    renderHero("x");

    await expect
      .element(page.getByText("/plugin marketplace add noppu-labs/ai-toolkit"))
      .toBeVisible();
    await expect
      .element(page.getByText("npx skills add noppu-labs/ai-toolkit/laravel"))
      .toBeVisible();
  });

  it("copies the Claude Code commands to the clipboard", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    renderHero("x");

    await page
      .getByRole("button", { name: "Copy Claude Code install commands" })
      .click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      "/plugin marketplace add noppu-labs/ai-toolkit\n/plugin install laravel@ai-toolkit\n/plugin install inertia-react@ai-toolkit",
    );
  });

  it("copies the skills CLI commands to the clipboard", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    renderHero("x");

    await page
      .getByRole("button", { name: "Copy skills CLI commands" })
      .click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      "npx skills add noppu-labs/ai-toolkit/laravel\nnpx skills add noppu-labs/ai-toolkit/inertia-react",
    );
  });
});
