import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../src/App.tsx";
import { prerenderPages } from "../src/entry-server.tsx";
import catalog from "../src/generated/catalog.json";
import { catalogSkills } from "../src/lib/catalog.ts";
import { HOME_HEAD } from "../src/lib/pages.ts";
import { skillPath } from "../src/lib/site.ts";

describe("rendering in Node, as the build's prerender does", () => {
  it("runs without a window", () => {
    expect(typeof window).toBe("undefined");
  });

  it("renders the home page with the phone layout and every catalog row", () => {
    const html = renderToString(createElement(App));

    expect(html).toContain('id="skills"');
    expect(html).toContain("The whole catalog.");
    expect(html).not.toContain('aria-label="Skill details"');
    expect(html).not.toMatch(/Show \d+ more/);
    for (const skill of catalogSkills(catalog.plugins)) {
      expect(html).toContain(`href="${skillPath(skill.name)}"`);
    }
  });

  it("prerenders the home page and one page per catalog skill", () => {
    const pages = prerenderPages();
    const skills = catalogSkills(catalog.plugins);

    expect(pages[0]?.head).toEqual(HOME_HEAD);
    expect(pages.map((page) => page.head.path)).toEqual([
      "/",
      ...skills.map((skill) => skillPath(skill.name)),
    ]);
    for (const [index, skill] of skills.entries()) {
      const html = pages[index + 1]?.html ?? "";
      expect(html.split("<h1").length - 1, skill.name).toBe(1);
      expect(html).toContain(skill.name);
    }
  });
});
