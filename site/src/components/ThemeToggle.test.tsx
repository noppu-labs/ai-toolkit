import { ThemeProvider } from "next-themes";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ThemeToggle } from "./ThemeToggle.tsx";

function renderToggle(defaultTheme: string): void {
  render(
    <ThemeProvider attribute="class" defaultTheme={defaultTheme} enableSystem>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

afterEach(() => {
  window.localStorage.removeItem("theme");
  document.documentElement.classList.remove("dark");
});

describe("ThemeToggle", () => {
  it("toggles from light to dark and persists", async () => {
    window.localStorage.setItem("theme", "light");
    renderToggle("light");

    const toggle = page.getByRole("button", { name: "Toggle theme" });
    await expect.element(toggle).toBeVisible();
    await toggle.click();

    await expect
      .poll(() => document.documentElement.classList.contains("dark"))
      .toBe(true);
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it("toggles from dark back to light", async () => {
    window.localStorage.setItem("theme", "dark");
    document.documentElement.classList.add("dark");
    renderToggle("dark");

    await page.getByRole("button", { name: "Toggle theme" }).click();

    await expect
      .poll(() => document.documentElement.classList.contains("dark"))
      .toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("light");
  });
});
