import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  ogImageHtml,
  readOgImageAssets,
} from "./og-image.ts";

const SITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("ogImageHtml", () => {
  const html = ogImageHtml(readOgImageAssets(SITE_DIR));

  it("carries the wordmark, the hero line, the address and the byline", () => {
    const text = html.replace(/<[^>]+>/g, "");

    expect(text).toContain("AI Toolkit");
    expect(text).toContain(
      "Agent skills for deep code review and grounded investigation.",
    );
    expect(text).toContain("toolkit.noppu.com");
    expect(text).toContain("by Noppu Labs");
  });

  it("embeds the palette, the fonts and both marks, so it renders offline", () => {
    expect(html).toContain("--palette-pink:");
    expect(html.match(/data:font\/woff2;base64,/g)).toHaveLength(2);
    expect(html.match(/data:image\/svg\+xml;base64,/g)).toHaveLength(2);
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
  });
});

describe("public/og-image.png", () => {
  const png = readFileSync(join(SITE_DIR, "public", "og-image.png"));

  it("is a 1200×630 PNG", () => {
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(OG_IMAGE_WIDTH);
    expect(png.readUInt32BE(20)).toBe(OG_IMAGE_HEIGHT);
  });

  it("stays small enough for link previews", () => {
    expect(png.byteLength).toBeLessThan(200 * 1024);
  });
});
