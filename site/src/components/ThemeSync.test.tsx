import type { ComponentType } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render } from "vitest-browser-react";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import { resetPreferences, stubSystemTheme } from "@/test/preferences";

const LIGHT = "rgb(255, 244, 249)";
const DARK = "rgb(42, 34, 41)";

let metas: HTMLMetaElement[] = [];
let ThemeSync: ComponentType;

function contents(): string[] {
  return metas.map((meta) => meta.content);
}

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

beforeAll(async () => {
  const pairs: [media: string, content: string][] = [
    ["(prefers-color-scheme: light)", LIGHT],
    ["(prefers-color-scheme: dark)", DARK],
  ];
  metas = pairs.map(([media, content]) => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.media = media;
    meta.content = content;
    document.head.append(meta);

    return meta;
  });
  // The module reads the metas when it loads, so it is imported after they exist.
  ({ ThemeSync } = await import("./ThemeSync.tsx"));
});

beforeEach(() => {
  resetPreferences();
});

afterEach(() => {
  resetPreferences();
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const meta of metas) {
    meta.remove();
  }
});

describe("ThemeSync", () => {
  it("applies the dark theme to <html> and both theme-color metas", async () => {
    usePreferencesStore.getState().setTheme("dark");
    render(<ThemeSync />);

    await expect.poll(contents).toEqual([DARK, DARK]);
    expect(isDark()).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("applies the light theme to <html> and both theme-color metas", async () => {
    usePreferencesStore.getState().setTheme("light");
    render(<ThemeSync />);

    await expect.poll(contents).toEqual([LIGHT, LIGHT]);
    expect(isDark()).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("follows the OS setting, live, while the theme is system", async () => {
    const system = stubSystemTheme(false);
    render(<ThemeSync />);
    await expect.poll(contents).toEqual([LIGHT, LIGHT]);

    system.setDark(true);

    await expect.poll(isDark).toBe(true);
    expect(contents()).toEqual([DARK, DARK]);
  });

  it("stops following the OS once a theme is chosen", async () => {
    const system = stubSystemTheme(true);
    render(<ThemeSync />);
    await expect.poll(isDark).toBe(true);

    usePreferencesStore.getState().setTheme("light");
    await expect.poll(isDark).toBe(false);
    system.setDark(true);

    await expect.poll(isDark).toBe(false);
  });
});
