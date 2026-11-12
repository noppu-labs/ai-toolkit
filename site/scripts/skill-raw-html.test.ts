import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Html } from "mdast";
import { defineMdastPlugin, markdownToHtml } from "satteri";
import { describe, expect, it } from "vitest";
import { buildCatalog } from "./build-catalog.ts";
import { splitFrontmatter } from "./frontmatter.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The raw HTML nodes (block or inline, never code) Sätteri finds in `markdown`. */
async function rawHtmlIn(markdown: string): Promise<string[]> {
  const found: string[] = [];

  await markdownToHtml(markdown, {
    mdastPlugins: [
      defineMdastPlugin({
        name: "find-raw-html",
        html: (node: Html): void => {
          found.push(node.value);
        },
      }),
    ],
  });

  return found;
}

describe("rawHtmlIn", () => {
  it("finds block and inline HTML but not HTML in code", async () => {
    const markdown = [
      "<div>block</div>",
      "",
      "text <b>inline</b>",
      "",
      "`<i>span</i>`",
      "",
      "```html",
      "<script>fenced</script>",
      "```",
    ].join("\n");

    expect((await rawHtmlIn(markdown)).join("")).toBe(
      "<div>block</div><b></b>",
    );
  });
});

describe("the SKILL.md files", () => {
  const files = buildCatalog(REPO_ROOT).plugins.flatMap((plugin) =>
    plugin.skills.map((skill) => skill.path),
  );

  it("exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s finds no raw HTML in any SKILL.md body", async (file) => {
    const { body } = splitFrontmatter(
      readFileSync(resolve(REPO_ROOT, file), "utf8"),
      file,
    );

    expect(await rawHtmlIn(body)).toEqual([]);
  });
});
