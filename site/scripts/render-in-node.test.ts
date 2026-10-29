import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../src/App.tsx";
import catalog from "../src/generated/catalog.json";
import { catalogSkills } from "../src/lib/catalog.ts";
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
});
