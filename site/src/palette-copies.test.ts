import { describe, expect, it } from "vitest";
import { noscriptInstallHtml } from "../scripts/noscript-install.ts";
import primitives from "./css/tokens/primitives.css?raw";

/** The `--palette-*` custom properties a stylesheet or style attribute declares. */
function paletteDeclarations(css: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const [, name, value] of css.matchAll(
    /(--palette-[\w-]+):\s*([^;"]+?)\s*(?:;|")/g,
  )) {
    if (name !== undefined && value !== undefined) {
      declarations.set(name, value);
    }
  }
  return declarations;
}

const palette = paletteDeclarations(primitives);

/** Opaque colours, so the alpha grid lines stay free to differ. */
function opaqueColours(css: string): string[] {
  return css.match(/oklch\([^/)]*\)/g) ?? [];
}

async function notFoundPage(): Promise<string> {
  const response = await fetch("/404.html");
  return response.text();
}

describe("colours copied from primitives.css", () => {
  it("parses the palette", () => {
    expect(palette.get("--palette-black")).toBe("oklch(0 0 0)");
  });

  it.each([
    ["404.html", notFoundPage],
    [
      "the noscript install box",
      async (): Promise<string> => noscriptInstallHtml(),
    ],
  ])(
    "%s declares palette tokens with the palette's values, and no other opaque colour",
    async (_, read) => {
      const copy = await read();
      const copied = paletteDeclarations(copy);

      expect(copied.size).toBeGreaterThan(0);
      for (const [name, value] of copied) {
        expect(value, name).toBe(palette.get(name));
      }
      expect(opaqueColours(copy)).toHaveLength(copied.size);
    },
  );
});
