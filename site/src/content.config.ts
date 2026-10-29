import { defineCollection } from "astro:content";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "../scripts/build-catalog.ts";
import { CATALOG_ID, catalogSchema } from "./lib/catalog-schema.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** One entry holding the whole catalog, so every consumer keeps taking `Catalog`. */
const catalog = defineCollection({
  loader: () => [{ id: CATALOG_ID, ...buildCatalog(repoRoot) }],
  schema: catalogSchema,
});

export const collections: { catalog: typeof catalog } = { catalog };
