import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HOME_HEAD, type PageHead } from "../src/lib/pages.ts";
import { SITE_URL } from "../src/lib/site.ts";
import {
  outputFile,
  pageDocument,
  sitemapXml,
  writeSite,
} from "./prerender.ts";

const TEMPLATE_PATH = new URL("../index.html", import.meta.url);
const template = readFileSync(TEMPLATE_PATH, "utf8");

const SKILL_HEAD: PageHead = {
  title: 'a "b" & <c> $&',
  description: "d $& e",
  path: "/skills/x",
};

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

let dir = "";

afterEach(() => {
  if (dir !== "") {
    rmSync(dir, { recursive: true, force: true });
    dir = "";
  }
});

describe("pageDocument", () => {
  it("swaps the home page's head for the page's, escaped, and fills the root", () => {
    const document = pageDocument(template, {
      head: SKILL_HEAD,
      html: "<p>hi</p>",
    });

    expect(document).toContain(
      "<title>a &quot;b&quot; &amp; &lt;c&gt; $&amp;</title>",
    );
    expect(count(document, 'content="d $&amp; e"')).toBe(2);
    expect(document).toContain(`href="${SITE_URL}/skills/x"`);
    expect(document).toContain(`content="${SITE_URL}/skills/x"`);
    expect(document).toContain('<div id="root"><p>hi</p></div>');
    expect(document).toContain(`content="${SITE_URL}/og-image.png"`);
    expect(document).not.toContain(HOME_HEAD.title);
    expect(document).not.toContain(HOME_HEAD.description);
  });

  it("leaves the home page's head as it is", () => {
    expect(pageDocument(template, { head: HOME_HEAD, html: "<p>hi</p>" })).toBe(
      template.replace(
        '<div id="root"></div>',
        '<div id="root"><p>hi</p></div>',
      ),
    );
  });

  it("fills the root last, so the page's own text cannot move the head", () => {
    const html = `<title>${HOME_HEAD.title}</title>`;
    const document = pageDocument(template, { head: SKILL_HEAD, html });

    expect(document).toContain(`<div id="root">${html}</div>`);
    expect(count(document, "<title>a &quot;b&quot;")).toBe(1);
  });

  it("fails, naming the text, when index.html no longer carries it", () => {
    const edited = template.replace(`href="${SITE_URL}/"`, 'href="/"');

    expect(() => pageDocument(edited, { head: SKILL_HEAD, html: "" })).toThrow(
      `href="${SITE_URL}/"`,
    );
  });
});

describe("outputFile", () => {
  it.each([
    ["/", "index.html"],
    ["/skills/x", "skills/x.html"],
  ])("writes %s to %s", (path, file) => {
    expect(outputFile(path)).toBe(file);
  });

  it.each([
    "/skills/x/",
    "skills/x",
    "/skills/../x",
    "/skills//x",
    "/skills/index",
    "/skills/404",
  ])("refuses %s", (path) => {
    expect(() => outputFile(path)).toThrow(path);
  });
});

describe("sitemapXml", () => {
  it("lists each page's canonical URL, in order", () => {
    const xml = sitemapXml(["/", "/skills/x"]);

    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n/);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect([...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/skills/x`,
    ]);
  });
});

describe("writeSite", () => {
  it("writes each page and the sitemap from the built index.html", () => {
    dir = mkdtempSync(join(tmpdir(), "prerender-test-"));
    copyFileSync(TEMPLATE_PATH, join(dir, "index.html"));

    writeSite(dir, [
      { head: HOME_HEAD, html: "<p>home</p>" },
      { head: SKILL_HEAD, html: "<p>x</p>" },
    ]);

    expect(readFileSync(join(dir, "index.html"), "utf8")).toContain(
      '<div id="root"><p>home</p></div>',
    );
    const skill = readFileSync(join(dir, "skills/x.html"), "utf8");
    expect(skill).toContain('<div id="root"><p>x</p></div>');
    expect(skill).toContain(`href="${SITE_URL}/skills/x"`);
    expect(readFileSync(join(dir, "sitemap.xml"), "utf8")).toBe(
      sitemapXml(["/", "/skills/x"]),
    );
  });

  it("reads index.html before writing over it", () => {
    dir = mkdtempSync(join(tmpdir(), "prerender-test-"));
    writeFileSync(join(dir, "index.html"), template);

    writeSite(dir, [
      { head: HOME_HEAD, html: "<p>home</p>" },
      { head: SKILL_HEAD, html: "<p>x</p>" },
    ]);

    const skill = readFileSync(join(dir, "skills/x.html"), "utf8");
    expect(skill).not.toContain("<p>home</p>");
  });
});
