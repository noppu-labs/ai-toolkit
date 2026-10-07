/**
 * Writes `public/og-image.png` and the hash of its inputs, `public/og-image.inputs.sha256`.
 * Nothing in the build regenerates the committed PNG: after changing the template, the palette,
 * the logo or the font packages, run `npm run og-image -w site` and commit both files;
 * `og-image.test.ts` fails until you do.
 * Needs the Chromium of `site/`'s own Playwright, which is not the root one the tests use: run
 * `npx playwright install chromium` from `site/`, or set `CHROMIUM_PATH` to another Chromium binary.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { SITE_URL } from "../src/lib/site.ts";
import { isMainModule } from "./main-module.ts";
import { ABOVE_THE_FOLD_FONTS } from "./preload-fonts.ts";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** The files the card embeds, so the template renders without a server or network access. */
export interface OgImageAssets {
  palette: string;
  mark: string;
  face: string;
  spaceGrotesk: Uint8Array;
  jetbrainsMono: Uint8Array;
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function woff2DataUri(font: Uint8Array): string {
  return `data:font/woff2;base64,${Buffer.from(font).toString("base64")}`;
}

export function ogImageHtml(assets: OgImageAssets): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
${assets.palette}
@font-face {
  font-family: "Space Grotesk Variable";
  font-weight: 300 700;
  src: url(${woff2DataUri(assets.spaceGrotesk)}) format("woff2");
}
@font-face {
  font-family: "JetBrains Mono Variable";
  font-weight: 100 800;
  src: url(${woff2DataUri(assets.jetbrainsMono)}) format("woff2");
}
* { box-sizing: border-box; margin: 0; }
html, body { width: ${OG_IMAGE_WIDTH}px; height: ${OG_IMAGE_HEIGHT}px; overflow: hidden; }
body {
  display: flex;
  gap: 40px;
  padding: 60px 72px 56px;
  background-color: var(--palette-shell);
  background-image:
    linear-gradient(oklch(0 0 0 / 0.05) 1px, transparent 1px),
    linear-gradient(90deg, oklch(0 0 0 / 0.05) 1px, transparent 1px);
  background-size: 48px 48px;
  color: var(--palette-ink);
  font-family: "Space Grotesk Variable", sans-serif;
  font-weight: 500;
}
.copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.brand { display: flex; align-items: center; gap: 20px; }
.tile {
  display: flex; width: 72px; height: 72px; overflow: hidden;
  border: 3px solid var(--palette-black); border-radius: 12px;
  background: var(--palette-white); box-shadow: 4px 4px 0 0 var(--palette-black);
}
.tile img { width: 100%; height: 100%; }
.wordmark { font-size: 44px; font-weight: 700; letter-spacing: -0.03em; }
h1 {
  margin-top: 36px;
  font-size: 62px; font-weight: 700; line-height: 1.04; letter-spacing: -0.04em;
}
.highlight {
  display: inline-block; margin: 6px 0; padding: 0 12px;
  border: 3px solid var(--palette-black); border-radius: 8px;
  background: var(--palette-pink); box-shadow: 5px 5px 0 0 var(--palette-black);
  transform: rotate(-1.5deg);
}
.footer { display: flex; align-items: center; gap: 20px; margin-top: auto; }
.url {
  padding: 8px 16px;
  border: 3px solid var(--palette-black); border-radius: 999px;
  background: var(--palette-white); box-shadow: 4px 4px 0 0 var(--palette-black);
  font-family: "JetBrains Mono Variable", monospace; font-size: 22px; font-weight: 700;
}
.by { color: var(--palette-plum-700); font-size: 22px; font-weight: 600; }
.art { position: relative; flex: none; width: 400px; height: 400px; margin-top: 70px; }
.art > * { position: absolute; inset: 0; border: 3px solid var(--palette-black); border-radius: 20px; }
.behind { background: var(--palette-periwinkle); transform: translate(16px, 16px) rotate(3deg); }
.card {
  display: flex; padding: 28px;
  background: var(--palette-pink); box-shadow: 10px 10px 0 0 var(--palette-black);
  transform: rotate(-2deg);
}
.card img { width: 100%; height: 100%; }
</style>
</head>
<body>
<div class="copy">
  <div class="brand">
    <span class="tile"><img alt="" src="${svgDataUri(assets.face)}"></span>
    <span class="wordmark">AI Toolkit</span>
  </div>
  <h1>Agent skills for <span class="highlight">deep code review</span> and grounded investigation.</h1>
  <div class="footer">
    <span class="url">${new URL(SITE_URL).host}</span>
    <span class="by">by Noppu Labs</span>
  </div>
</div>
<div class="art" aria-hidden="true">
  <div class="behind"></div>
  <div class="card"><img alt="" src="${svgDataUri(assets.mark)}"></div>
</div>
</body>
</html>
`;
}

export function readOgImageAssets(siteDir: string): OgImageAssets {
  const require = createRequire(join(siteDir, "package.json"));
  // The site preloads the same files; each file name starts with its package name.
  const font = (pkg: string): Uint8Array => {
    const file = ABOVE_THE_FOLD_FONTS.find((name) =>
      name.startsWith(`${pkg}-`),
    );
    if (file === undefined) {
      throw new Error(`og-image: ABOVE_THE_FOLD_FONTS has no ${pkg} file`);
    }
    return readFileSync(
      require.resolve(`@fontsource-variable/${pkg}/files/${file}`),
    );
  };
  return {
    palette: readFileSync(
      join(siteDir, "src", "css", "tokens", "primitives.css"),
      "utf8",
    ),
    mark: readFileSync(join(siteDir, "public", "logo-mark.svg"), "utf8"),
    face: readFileSync(join(siteDir, "public", "logo-face.svg"), "utf8"),
    spaceGrotesk: font("space-grotesk"),
    jetbrainsMono: font("jetbrains-mono"),
  };
}

/** Hashes the rendered template, which embeds every input, so a changed input changes the hash. */
export function ogImageInputsHash(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export function ogImageInputsHashPath(siteDir: string): string {
  return join(siteDir, "public", "og-image.inputs.sha256");
}

async function render(siteDir: string): Promise<string> {
  const html = ogImageHtml(readOgImageAssets(siteDir));
  const executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(
    executablePath ? { executablePath } : {},
  );
  try {
    const page = await browser.newPage({
      viewport: { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, {
      waitUntil: "load",
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const out = join(siteDir, "public", "og-image.png");
    await page.screenshot({ path: out, type: "png" });
    writeFileSync(
      ogImageInputsHashPath(siteDir),
      `${ogImageInputsHash(html)}\n`,
    );
    return out;
  } finally {
    await browser.close();
  }
}

if (isMainModule(import.meta.url)) {
  const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const out = await render(siteDir);
  console.log(`og-image.png written: ${out}`);
}
