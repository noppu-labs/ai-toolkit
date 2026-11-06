import { defineCollection, type SchemaContext } from "astro:content";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "astro/loaders";
import { buildCatalog } from "../scripts/build-catalog.ts";
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

export const collections: {
  catalog: typeof catalog;
  opencode: typeof opencode;
} = { catalog, opencode };
