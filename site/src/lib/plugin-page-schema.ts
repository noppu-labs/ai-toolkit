import { z } from "astro/zod";
import {
  faqSchema,
  highlightSchema,
  linkSchema,
  list,
  text,
} from "./manifest-fields.ts";

/** The prose of a plugin's page, kept in `src/content/plugins/<name>.yaml`. */
export const pluginPageSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: text(3, 60),
    // The site appends " · AI Toolkit" (13 characters), and search results cut a title at roughly 60.
    seo: z.object({ title: text(10, 47), description: text(70, 160) }).strict(),
    tagline: text(20, 220),
    highlights: z
      .object({ heading: text(3, 80), items: list(highlightSchema, 3, 6) })
      .strict(),
    howItWorks: z
      .object({ heading: text(3, 80), steps: list(text(10, 260), 2, 6) })
      .strict(),
    requirements: z.object({ items: list(text(3, 200), 1, 8) }).strict(),
    faq: list(faqSchema, 3, 8),
    links: list(linkSchema, 0, 8).optional(),
  })
  .strict();

export type PluginPageCopy = z.infer<typeof pluginPageSchema>;

/** Every prose string on the page, for checks that read the copy as text. */
export function copyTexts(copy: PluginPageCopy): string[] {
  return [
    copy.title,
    copy.seo.title,
    copy.seo.description,
    copy.tagline,
    copy.highlights.heading,
    ...copy.highlights.items.flatMap((item) => [
      item.title,
      item.label,
      item.body,
    ]),
    copy.howItWorks.heading,
    ...copy.howItWorks.steps,
    ...copy.requirements.items,
    ...copy.faq.flatMap((item) => [item.q, item.a]),
    ...(copy.links ?? []).map((link) => link.label),
  ];
}
