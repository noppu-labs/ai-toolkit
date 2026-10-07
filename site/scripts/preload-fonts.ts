import { basename } from "node:path";
import type {
  HtmlTagDescriptor,
  IndexHtmlTransformContext,
  Plugin,
  ResolvedConfig,
} from "vite";

/** The latin subsets of the two variable fonts the first screen renders with. */
export const ABOVE_THE_FOLD_FONTS: readonly string[] = [
  "space-grotesk-latin-wght-normal.woff2",
  "jetbrains-mono-latin-wght-normal.woff2",
];

/** The fields of a Rolldown output asset this plugin reads. */
export interface EmittedAsset {
  type: "asset" | "chunk";
  fileName: string;
  names?: readonly string[];
  originalFileNames?: readonly string[];
}

function emittedFrom(asset: EmittedAsset, font: string): boolean {
  return (
    asset.type === "asset" &&
    [...(asset.names ?? []), ...(asset.originalFileNames ?? [])].some(
      (name) => basename(name) === font,
    )
  );
}

/** `<link rel="preload">` tags for the hashed files the build emitted for `fonts`. A missing font fails the build, so a renamed upstream file cannot silently drop the preload. */
export function fontPreloadTags(
  assets: readonly EmittedAsset[],
  fonts: readonly string[],
  base: string,
): HtmlTagDescriptor[] {
  return fonts.map((font) => {
    const asset = assets.find((candidate) => emittedFrom(candidate, font));
    if (asset === undefined) {
      throw new Error(`preload-fonts: the build emitted no file for ${font}`);
    }
    return {
      tag: "link",
      attrs: {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: `${base}${asset.fileName}`,
        crossorigin: true,
      },
      injectTo: "head",
    };
  });
}

/** Preloads the above-the-fold fonts in the built `index.html`, so they download alongside the CSS rather than after it. */
export function preloadFonts(
  fonts: readonly string[] = ABOVE_THE_FOLD_FONTS,
): Plugin {
  let base = "/";
  return {
    name: "preload-fonts",
    apply: "build",
    configResolved(config: ResolvedConfig): void {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(
        _html: string,
        context: IndexHtmlTransformContext,
      ): HtmlTagDescriptor[] {
        return fontPreloadTags(
          Object.values(context.bundle ?? {}),
          fonts,
          base,
        );
      },
    },
  };
}
