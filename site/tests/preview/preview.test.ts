import { beforeEach, describe, expect, inject, it } from "vitest";

const PREVIEW_URL: string = inject("previewUrl");

// A newer push replaced the commit under test, so the preview no longer shows it.
beforeEach(({ skip }) => {
  skip(inject("previewIsNewer"), "the preview shows a newer commit");
});

/** Fetches `path` of the preview without following redirects, so the test sees Cloudflare's own answer. */
function get(path: string): Promise<Response> {
  return fetch(`${PREVIEW_URL}${path}`, { redirect: "manual" });
}

describe("Cloudflare's preview", () => {
  it("serves a skill's page at its URL with no trailing slash, canonical to production", async () => {
    const response = await get("/skills/deep");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      '<link rel="canonical" href="https://toolkit.noppu.com/skills/deep">',
    );
  });

  it.each(["/skills/deep/", "/skills/deep.html"])(
    "redirects %s to the URL with no trailing slash",
    async (path) => {
      const response = await get(path);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toMatch(/\/skills\/deep$/);
    },
  );

  it("answers an unknown skill with the 404 page", async () => {
    const response = await get("/skills/not-a-skill");

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("This page wandered off");
  });

  it("keeps the preview out of search results", async () => {
    const response = await get("/");

    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("redirects the old sitemap URL to the sitemap index, which it serves", async () => {
    const old = await get("/sitemap.xml");
    const index = await get("/sitemap-index.xml");

    expect(old.status).toBe(301);
    expect(old.headers.get("location")).toMatch(/\/sitemap-index\.xml$/);
    expect(index.status).toBe(200);
  });
});
