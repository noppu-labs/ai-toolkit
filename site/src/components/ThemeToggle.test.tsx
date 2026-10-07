import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  PREFERENCES_STORAGE_KEY,
  usePreferencesStore,
} from "@/stores/usePreferencesStore";
import { resetPreferences, stubSystemTheme } from "@/test/preferences";
import { ThemeSync } from "./ThemeSync.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

function renderToggle(): void {
  render(
    <>
      <ThemeSync />
      <ThemeToggle />
    </>,
  );
}

function storedTheme(): unknown {
  const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw).state.theme;
}

beforeEach(() => {
  resetPreferences();
});

afterEach(() => {
  resetPreferences();
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("switches from light to dark and persists the choice", async () => {
    usePreferencesStore.getState().setTheme("light");
    renderToggle();

    await page.getByRole("button", { name: "Switch to dark theme" }).click();

    await expect
      .poll(() => document.documentElement.classList.contains("dark"))
      .toBe(true);
    expect(storedTheme()).toBe("dark");
  });

  it("switches from dark back to light", async () => {
    usePreferencesStore.getState().setTheme("dark");
    renderToggle();

    await page.getByRole("button", { name: "Switch to light theme" }).click();

    await expect
      .poll(() => document.documentElement.classList.contains("dark"))
      .toBe(false);
    expect(storedTheme()).toBe("light");
  });

  it("names the switch away from the OS theme while following it", async () => {
    stubSystemTheme(true);
    renderToggle();

    const toggle = page.getByRole("button", { name: "Switch to light theme" });
    await expect.element(toggle).toBeVisible();
    await toggle.click();

    await expect
      .element(page.getByRole("button", { name: "Switch to dark theme" }))
      .toBeVisible();
    expect(usePreferencesStore.getState().theme).toBe("light");
  });
});
