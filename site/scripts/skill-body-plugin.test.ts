import { pathToFileURL } from "node:url";
import { markdownToHtml } from "satteri";
import { describe, expect, it } from "vitest";
import { skillBodyPlugin } from "./skill-body-plugin.ts";

const REPO_ROOT = "/work/ai-toolkit";
const REPO_URL = "https://github.com/example/repo";
const SKILL_PATH = `${REPO_ROOT}/inertia-react/skills/shadcn/SKILL.md`;

async function render(markdown: string, path: string): Promise<string> {
  return (
    await markdownToHtml(markdown, {
      fileURL: pathToFileURL(path),
      hastPlugins: [
        skillBodyPlugin({ repoRoot: REPO_ROOT, repoUrl: REPO_URL }),
      ],
    })
  ).html;
}

async function hrefOf(
  href: string,
  path = SKILL_PATH,
): Promise<string | undefined> {
  return /href="([^"]*)"/.exec(await render(`[x](${href})`, path))?.[1];
}

describe("skillBodyPlugin", async () => {
  it("points a relative link at the file on GitHub", async () => {
    const base = `${REPO_URL}/blob/main/inertia-react/skills`;

    expect(await hrefOf("./rules/styling.md")).toBe(
      `${base}/shadcn/rules/styling.md`,
    );
    expect(await hrefOf("cli.md#info")).toBe(`${base}/shadcn/cli.md#info`);
    expect(await hrefOf("../brief/SKILL.md")).toBe(`${base}/brief/SKILL.md`);
  });

  it("leaves absolute, root-relative, fragment and mailto links alone", async () => {
    const hrefs = ["https://x.dev/a", "/skills/deep", "#usage", "mailto:a@b.c"];

    expect(await Promise.all(hrefs.map((href) => hrefOf(href)))).toEqual(hrefs);
  });

  it("moves headings down two levels, stopping at h6", async () => {
    const html = await render(
      "# a\n\n## b\n\n#### c\n\n##### d\n\n###### e\n",
      SKILL_PATH,
    );

    expect([...html.matchAll(/<(h[1-6])[ >]/g)].map((m) => m[1])).toEqual([
      "h3",
      "h4",
      "h6",
      "h6",
      "h6",
    ]);
  });

  it("wraps each table in a box that scrolls sideways", async () => {
    const html = await render("| a | b |\n|---|---|\n| 1 | 2 |\n", SKILL_PATH);

    expect(html).toMatch(
      /<div class="overflow-x-auto"[^>]*><table>[\s\S]*<\/table><\/div>/,
    );
    expect(html.match(/<table/g)).toHaveLength(1);
  });

  it("makes each table's box a focusable region named after the heading above it", async () => {
    const table = "| a |\n|---|\n| 1 |\n";
    const html = await render(
      [
        table,
        "## Usage `npx`",
        table,
        table,
        "### Options",
        table,
        "## Usage `npx`",
        table,
      ].join("\n"),
      SKILL_PATH,
    );
    const boxes = [...html.matchAll(/<div ([^>]*)><table>/g)].map(
      (match) => match[1],
    );

    expect(boxes).toEqual(
      [
        "Table 1",
        "Usage npx",
        "Usage npx, table 3",
        "Options",
        "Usage npx, table 5",
      ].map(
        (label) =>
          `class="overflow-x-auto" tabindex="0" role="region" aria-label="${label}"`,
      ),
    );
  });

  it("ignores files that are not a skill's SKILL.md", async () => {
    const html = await render("# a\n\n[x](./x.md)\n", `${REPO_ROOT}/README.md`);

    expect(html).toContain("<h1");
    expect(html).toContain('href="./x.md"');
  });
});
