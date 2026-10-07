import { describe, expect, it } from "vitest";
import {
  ABOVE_THE_FOLD_FONTS,
  type EmittedAsset,
  fontPreloadTags,
} from "./preload-fonts.ts";

const ASSETS: EmittedAsset[] = [
  { type: "chunk", fileName: "assets/index-abc.js" },
  {
    type: "asset",
    fileName: "assets/space-grotesk-latin-ext-wght-normal-X1.woff2",
    names: ["space-grotesk-latin-ext-wght-normal.woff2"],
  },
  {
    type: "asset",
    fileName: "assets/space-grotesk-latin-wght-normal-X2.woff2",
    names: ["space-grotesk-latin-wght-normal.woff2"],
  },
  {
    type: "asset",
    fileName: "assets/jetbrains-mono-latin-wght-normal-X3.woff2",
    originalFileNames: [
      "node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
    ],
  },
];

describe("fontPreloadTags", () => {
  it("preloads the hashed latin files from the site root, as CORS font requests", () => {
    const tags = fontPreloadTags(ASSETS, ABOVE_THE_FOLD_FONTS, "/");

    expect(tags).toEqual(
      [
        "assets/space-grotesk-latin-wght-normal-X2.woff2",
        "assets/jetbrains-mono-latin-wght-normal-X3.woff2",
      ].map((file) => ({
        tag: "link",
        attrs: {
          rel: "preload",
          as: "font",
          type: "font/woff2",
          href: `/${file}`,
          crossorigin: true,
        },
        injectTo: "head",
      })),
    );
  });

  it("prefixes the hrefs with a sub-path base", () => {
    const tags = fontPreloadTags(ASSETS, ABOVE_THE_FOLD_FONTS, "/sub/");

    expect(tags.map((tag) => tag.attrs?.href)).toEqual([
      "/sub/assets/space-grotesk-latin-wght-normal-X2.woff2",
      "/sub/assets/jetbrains-mono-latin-wght-normal-X3.woff2",
    ]);
  });

  it("fails the build when a font was not emitted", () => {
    expect(() =>
      fontPreloadTags(ASSETS, ["missing-latin-wght-normal.woff2"], "/"),
    ).toThrow("the build emitted no file for missing-latin-wght-normal.woff2");
  });
});
