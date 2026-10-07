import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_ADD_COMMAND,
  pluginInstallCommand,
} from "@/lib/install-methods";
import { PLUGIN_ORDER } from "@/lib/plugins";
import { REPO_URL } from "@/lib/repo";
import { SITE_URL } from "@/lib/site";
import indexHtml from "../index.html?raw";
import {
  noscriptInstall,
  noscriptInstallCommands,
  noscriptInstallHtml,
} from "../scripts/noscript-install.ts";
import catalog from "./generated/catalog.json";

const doc = new DOMParser().parseFromString(indexHtml, "text/html");

function meta(key: string): string | null {
  return (
    doc
      .querySelector(`meta[property="${key}"], meta[name="${key}"]`)
      ?.getAttribute("content") ?? null
  );
}

describe("index.html sharing tags", () => {
  it("points the canonical link and og:url at the site root", () => {
    expect(
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe(`${SITE_URL}/`);
    expect(meta("og:url")).toBe(`${SITE_URL}/`);
  });

  it("shares the 1200×630 social card", () => {
    expect(meta("og:image")).toBe(`${SITE_URL}/og-image.png`);
    expect(meta("og:image:type")).toBe("image/png");
    expect(meta("og:image:width")).toBe("1200");
    expect(meta("og:image:height")).toBe("630");
    expect(meta("og:image:alt")).toMatch(/\S/);
    expect(meta("og:site_name")).toMatch(/AI Toolkit/);
  });

  it("gives X the large card and the image's alt text, leaving the rest to the Open Graph tags", () => {
    expect(meta("twitter:card")).toBe("summary_large_image");
    expect(meta("twitter:image:alt")).toBe(meta("og:image:alt"));
    for (const fallback of [
      "twitter:title",
      "twitter:description",
      "twitter:image",
    ]) {
      expect(meta(fallback)).toBeNull();
    }
  });

  it("serves the social card from public/", async () => {
    const response = await fetch("/og-image.png");

    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toBe("image/png");
  });
});

describe("noscript install box", () => {
  const box = new DOMParser().parseFromString(
    noscriptInstallHtml(),
    "text/html",
  ).body;

  it("lists the Claude Code install commands for every plugin, the marketplace once", () => {
    expect(noscriptInstallCommands()).toEqual([
      MARKETPLACE_ADD_COMMAND,
      ...PLUGIN_ORDER.map((plugin) =>
        pluginInstallCommand(plugin, "claude-code"),
      ),
    ]);
    expect(box.querySelector("pre")?.textContent).toBe(
      noscriptInstallCommands().join("\n"),
    );
    expect([...PLUGIN_ORDER].sort()).toEqual(
      catalog.plugins.map((plugin) => plugin.name).sort(),
    );
  });

  it("links to the README on GitHub", () => {
    expect(box.querySelector("a")?.getAttribute("href")).toBe(
      `${REPO_URL}#readme`,
    );
  });

  it("is added to index.html's body by the noscript-install plugin", () => {
    const hook = noscriptInstall().transformIndexHtml;

    expect(typeof hook).toBe("function");
    if (typeof hook === "function") {
      expect(
        hook.call(undefined as never, indexHtml, undefined as never),
      ).toEqual([
        { tag: "noscript", children: noscriptInstallHtml(), injectTo: "body" },
      ]);
    }
    expect(doc.querySelector("noscript")).toBeNull();
  });
});
