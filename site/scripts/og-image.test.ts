import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  ogImageHtml,
  ogImageInputsHash,
  ogImageInputsHashPath,
  readOgImageAssets,
} from "./og-image.ts";

const SITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const html = ogImageHtml(readOgImageAssets(SITE_DIR));

describe("ogImageHtml", () => {
  it("carries the wordmark, the hero line, the address and the byline", () => {
    // Match the words with any spaces and tags between them, rather than strip the tags.
    const words = (text: string): RegExp =>
      new RegExp(
        `>${text
          .split(" ")
          .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join(String.raw`(?:\s|<[^>]*>)+`)}<`,
      );

    expect(html).toMatch(words("AI Toolkit"));
    expect(html).toMatch(
      words("Agent skills for deep code review and grounded investigation."),
    );
    expect(html).toMatch(words("toolkit.noppu.com"));
    expect(html).toMatch(words("by Noppu Labs"));
  });

  it("embeds the palette, the fonts and both marks, so it renders offline", () => {
    expect(html).toContain("--palette-pink:");
    expect(html.match(/data:font\/woff2;base64,/g)).toHaveLength(2);
    expect(html.match(/data:image\/svg\+xml;base64,/g)).toHaveLength(2);
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
    expect(html).not.toMatch(/(url\(|@import)\s*["']?(https?:)?\/\//);
  });
});

describe("public/og-image.png", () => {
  const png = readFileSync(join(SITE_DIR, "public", "og-image.png"));

  it("is a 1200×630 PNG", () => {
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(OG_IMAGE_WIDTH);
    expect(png.readUInt32BE(20)).toBe(OG_IMAGE_HEIGHT);
  });

  it("was rendered from the current template, palette, logos and fonts", () => {
    const committed = readFileSync(ogImageInputsHashPath(SITE_DIR), "utf8");

    expect(
      committed.trim(),
      "the card's inputs changed: run `npm run og-image -w site` and commit og-image.png and og-image.inputs.sha256",
    ).toBe(ogImageInputsHash(html));
  });

  it("stays small enough for link previews", () => {
    expect(png.byteLength).toBeLessThan(200 * 1024);
  });
});
