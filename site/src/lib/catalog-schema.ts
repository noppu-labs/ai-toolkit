import { z } from "astro/zod";

/** The id of the collection's one entry, which holds the whole catalog. */
export const CATALOG_ID = "ai-toolkit";

const skillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  sourceUrl: z.string().min(1),
});

const pluginSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  agentCount: z.number().int().nonnegative(),
  ruleCount: z.number().int().nonnegative(),
  skills: z.array(skillSchema),
});

/**
 * The shape of `Catalog` (`catalog-types.ts`). Kept apart from
 * `content.config.ts` because that file imports `astro:content`, which tests
 * cannot load.
 */
export const catalogSchema = z.object({
  marketplaceName: z.string().min(1),
  marketplaceDescription: z.string().min(1),
  plugins: z.array(pluginSchema),
});
