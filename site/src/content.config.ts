import { defineCollection, type SchemaContext } from "astro:content";
import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { glob, type LoaderContext } from "astro/loaders";
import { z } from "astro/zod";
import { buildCatalog } from "../scripts/build-catalog.ts";
import { parseFrontmatter } from "../scripts/frontmatter.ts";
import { CATALOG_ID, catalogSchema } from "./lib/catalog-schema.ts";
import { manifestSchema } from "./lib/opencode-schema.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** One entry holding the whole catalog, so every consumer keeps taking `Catalog`. */
const catalog = defineCollection({
  loader: () => [{ id: CATALOG_ID, ...buildCatalog(repoRoot) }],
  schema: catalogSchema,
});

/** Each plugin's synced `toolkit-page.yaml`, keyed by the folder name (`opencode-cache-manager`). */
const opencode = defineCollection({
  loader: glob({
    pattern: "*/docs/toolkit-page.yaml",
    base: "./src/content/opencode",
    generateId: ({ entry }: { entry: string }): string =>
      entry.slice(0, entry.indexOf("/")),
  }),
  // No size refine here: for glob() collections `image()` is still a string
  // transform when the schema runs. The sync and `loadOpenCodePlugins` check it.
  schema: ({ image }: SchemaContext) => manifestSchema(image(), image()),
});

/**
 * Each skill's SKILL.md, keyed by the skill's name. Kept out of the catalog so the home page's
 * island props do not carry the bodies.
 *
 * Not a `glob()` loader: that parses the header as strict YAML, and some SKILL.md values hold a
 * colon. This reads the header the way `buildCatalog` does and renders only the body, with the
 * file's URL so the skill-body plugin knows which skill it is rendering.
 */
const skills = defineCollection({
  loader: {
    name: "skill-markdown",
    load: async ({
      store,
      parseData,
      renderMarkdown,
      generateDigest,
    }: LoaderContext): Promise<void> => {
      store.clear();

      const files: string[] = globSync("*/skills/*/SKILL.md", {
        cwd: repoRoot,
        exclude: (name: string): boolean => name === "node_modules",
      });

      await Promise.all(
        files.map(async (file: string): Promise<void> => {
          const path: string = resolve(repoRoot, file);
          const contents: string = readFileSync(path, "utf8");
          const data: Record<string, string> = parseFrontmatter(contents, path);
          const body: string = contents
            .slice(contents.indexOf("\n---", 3) + 4)
            .trim();
          const id = String(data.name);

          store.set({
            id,
            data: await parseData({ id, data, filePath: path }),
            body,
            filePath: file,
            digest: generateDigest(contents),
            rendered: await renderMarkdown(body, {
              fileURL: pathToFileURL(path),
            }),
          });
        }),
      );
    },
  },
  schema: z.looseObject({ name: z.string().min(1) }),
});

export const collections: {
  catalog: typeof catalog;
  opencode: typeof opencode;
  skills: typeof skills;
} = { catalog, opencode, skills };
