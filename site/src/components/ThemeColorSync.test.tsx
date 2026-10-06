import { ThemeProvider } from "next-themes";
import type { ComponentType } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

const LIGHT = "rgb(255, 244, 249)";
const DARK = "rgb(42, 34, 41)";

let metas: HTMLMetaElement[] = [];
let ThemeColorSync: ComponentType;

function contents(): string[] {
  return metas.map((meta) => meta.content);
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
  ({ ThemeColorSync } = await import("./ThemeColorSync.tsx"));
});

afterEach(() => {
  window.localStorage.removeItem("theme");
  document.documentElement.classList.remove("dark");
});

afterAll(() => {
  for (const meta of metas) {
    meta.remove();
  }
});

describe("ThemeColorSync", () => {
  it("points both theme-color metas at the dark colour in the dark theme", async () => {
    window.localStorage.setItem("theme", "dark");
    render(
      <ThemeProvider attribute="class" enableSystem>
        <ThemeColorSync />
      </ThemeProvider>,
    );

    await expect.poll(contents).toEqual([DARK, DARK]);
  });

  it("points both theme-color metas at the light colour in the light theme", async () => {
    window.localStorage.setItem("theme", "light");
    render(
      <ThemeProvider attribute="class" enableSystem>
        <ThemeColorSync />
      </ThemeProvider>,
    );

    await expect.poll(contents).toEqual([LIGHT, LIGHT]);
  });
});
