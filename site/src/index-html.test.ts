import { describe, expect, it } from "vitest";
import { HOME_HEAD } from "@/lib/pages";
import { SITE_URL } from "@/lib/site";
import indexHtml from "../index.html?raw";

const doc = new DOMParser().parseFromString(indexHtml, "text/html");

function meta(key: string): string | null {
  return (
    doc
      .querySelector(`meta[property="${key}"], meta[name="${key}"]`)
      ?.getAttribute("content") ?? null
  );
}

describe("index.html sharing tags", () => {
  it("carries the home page's title and description, which the prerender swaps per page", () => {
    expect(doc.title).toBe(HOME_HEAD.title);
    expect(meta("og:title")).toBe(HOME_HEAD.title);
    expect(meta("description")).toBe(HOME_HEAD.description);
    expect(meta("og:description")).toBe(HOME_HEAD.description);
  });

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
