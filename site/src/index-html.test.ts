import { describe, expect, it } from "vitest";
import { pluginInstallSteps } from "@/lib/install";
import { PLUGIN_ORDER } from "@/lib/plugins";
import { REPO_URL } from "@/lib/repo";
import { SITE_URL } from "@/lib/site";
import indexHtml from "../index.html?raw";
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

  it("gives X the large card, with the Open Graph title, description and image", () => {
    expect(meta("twitter:card")).toBe("summary_large_image");
    expect(meta("twitter:title")).toBe(meta("og:title"));
    expect(meta("twitter:description")).toBe(meta("og:description"));
    expect(meta("twitter:image")).toBe(meta("og:image"));
    expect(meta("twitter:image:alt")).toBe(meta("og:image:alt"));
  });

  it("serves the social card from public/", async () => {
    const response = await fetch("/og-image.png");

    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toBe("image/png");
  });
});

describe("index.html noscript fallback", () => {
  const noscript = doc.querySelector("body noscript");

  it("lists the Claude Code install commands for every plugin", () => {
    const commands = [
      ...new Set(
        PLUGIN_ORDER.flatMap((plugin) =>
          pluginInstallSteps(plugin, "claude-code").map((step) => step.command),
        ),
      ),
    ];

    expect(noscript?.querySelector("pre")?.textContent.trim()).toBe(
      commands.join("\n"),
    );
    expect([...PLUGIN_ORDER].sort()).toEqual(
      catalog.plugins.map((plugin) => plugin.name).sort(),
    );
  });

  it("links to the README on GitHub", () => {
    expect(noscript?.querySelector("a")?.getAttribute("href")).toBe(
      `${REPO_URL}#readme`,
    );
  });
});
