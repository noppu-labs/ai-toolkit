import type { Element, ElementContent, Root } from "hast";
import { describe, expect, it } from "vitest";
import { rehypeSkillBody } from "./rehype-skill-body.ts";

const REPO_ROOT = "/work/ai-toolkit";
const REPO_URL = "https://github.com/example/repo";
const SKILL_PATH = `${REPO_ROOT}/inertia-react/skills/shadcn/SKILL.md`;

function makeElement(
  tagName: string,
  properties: Element["properties"] = {},
  children: ElementContent[] = [],
): Element {
  return { type: "element", tagName, properties, children };
}

function makeRoot(...children: Element[]): Root {
  return { type: "root", children };
}

function transform(tree: Root, path: string): Root {
  rehypeSkillBody({ repoRoot: REPO_ROOT, repoUrl: REPO_URL })(tree, { path });

  return tree;
}

function hrefOf(href: string, path = SKILL_PATH): unknown {
  const link = makeElement("a", { href });
  transform(makeRoot(makeElement("p", {}, [link])), path);

  return link.properties.href;
}

describe("rehypeSkillBody", () => {
  it("points a relative link at the file on GitHub", () => {
    const base = `${REPO_URL}/blob/main/inertia-react/skills`;

    expect(hrefOf("./rules/styling.md")).toBe(
      `${base}/shadcn/rules/styling.md`,
    );
    expect(hrefOf("cli.md#info")).toBe(`${base}/shadcn/cli.md#info`);
    expect(hrefOf("../brief/SKILL.md")).toBe(`${base}/brief/SKILL.md`);
  });

  it("leaves absolute, root-relative, fragment and mailto links alone", () => {
    for (const href of [
      "https://x.dev/a",
      "/skills/deep",
      "#usage",
      "mailto:a@b.c",
    ]) {
      expect(hrefOf(href)).toBe(href);
    }
  });

  it("moves headings down two levels, stopping at h6", () => {
    const tags = ["h1", "h2", "h4", "h5", "h6"];
    const tree = makeRoot(
      makeElement(
        "div",
        {},
        tags.map((tag) => makeElement(tag)),
      ),
    );

    transform(tree, SKILL_PATH);

    const div = tree.children[0] as Element;
    expect(div.children.map((child) => (child as Element).tagName)).toEqual([
      "h3",
      "h4",
      "h6",
      "h6",
      "h6",
    ]);
  });

  it("ignores files that are not a skill's SKILL.md", () => {
    const link = makeElement("a", { href: "./x.md" });
    const heading = makeElement("h1");
    const tree = makeRoot(link, heading);

    transform(tree, `${REPO_ROOT}/README.md`);

    expect(link.properties.href).toBe("./x.md");
    expect(heading.tagName).toBe("h1");
  });
});
