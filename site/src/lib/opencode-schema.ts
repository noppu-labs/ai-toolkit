import { z } from "astro/zod";
import type { DocumentOptions, ParseOptions, SchemaOptions } from "yaml";

/** Where a plugin repo keeps its manifest. */
export const MANIFEST_PATH = "docs/toolkit-page.yaml";

/**
 * The options Astro's own YAML parser passes to `parseDocument`
 * (`@astrojs/internal-helpers/dist/yaml.js`), so the sync and the build read a
 * file the same way.
 */
export const YAML_OPTIONS: ParseOptions & DocumentOptions & SchemaOptions = {
  customTags: ["timestamp"],
  merge: true,
  schema: "core",
};

const MAX_CONFIG_LINES = 40;

/** A trimmed, non-empty string with a length range. */
function text(min: number, max: number): z.ZodString {
  return z.string().trim().min(min).max(max);
}

function list<T extends z.ZodType>(
  item: T,
  min: number,
  max: number,
): z.ZodArray<T> {
  return z.array(item).min(min).max(max);
}

const hostSchema = z
  .object({
    label: text(1, 24),
    commands: list(text(1, 200), 1, 3),
    note: text(1, 200).optional(),
  })
  .strict();

const highlightSchema = z
  .object({ label: text(1, 16), title: text(3, 60), body: text(10, 260) })
  .strict();

const configSchema = z
  .object({
    path: text(1, 120),
    language: z.enum(["json", "jsonc", "sh"]),
    code: z
      .string()
      .min(1)
      .refine(
        (code) => code.trimEnd().split("\n").length <= MAX_CONFIG_LINES,
        `at most ${MAX_CONFIG_LINES} lines`,
      ),
  })
  .strict();

const faqSchema = z.object({ q: text(5, 120), a: text(10, 400) }).strict();

const linkSchema = z
  .object({
    label: text(1, 40),
    href: z.url().startsWith("https://"),
  })
  .strict();

type Strict<T extends z.core.$ZodShape> = z.ZodObject<T, z.core.$strict>;

type ManifestShape<H extends z.ZodType, F extends z.ZodType> = {
  schemaVersion: z.ZodLiteral<1>;
  title: z.ZodString;
  seo: Strict<{ title: z.ZodString; description: z.ZodString }>;
  tagline: z.ZodString;
  summary: z.ZodString;
  chips: z.ZodArray<z.ZodString>;
  image: Strict<{ src: H; alt: z.ZodString }>;
  install: Strict<{
    hosts: z.ZodArray<typeof hostSchema>;
    note: z.ZodOptional<z.ZodString>;
  }>;
  highlights: Strict<{
    heading: z.ZodString;
    items: z.ZodArray<typeof highlightSchema>;
  }>;
  howItWorks: Strict<{
    heading: z.ZodString;
    steps: z.ZodArray<z.ZodString>;
    figure: z.ZodOptional<
      Strict<{
        src: F;
        alt: z.ZodString;
        caption: z.ZodOptional<z.ZodString>;
      }>
    >;
  }>;
  requirements: Strict<{
    items: z.ZodArray<z.ZodString>;
    config: z.ZodOptional<typeof configSchema>;
  }>;
  faq: z.ZodOptional<z.ZodArray<typeof faqSchema>>;
  links: z.ZodOptional<z.ZodArray<typeof linkSchema>>;
};

/**
 * The manifest a plugin repo publishes. The image fields take a schema so the
 * sync reads them as paths and the build reads them as Astro images.
 */
export function manifestSchema<H extends z.ZodType, F extends z.ZodType>(
  heroImage: H,
  figureImage: F,
): Strict<ManifestShape<H, F>> {
  return z
    .object({
      schemaVersion: z.literal(1),
      title: text(3, 60),
      seo: z
        .object({ title: text(10, 60), description: text(70, 160) })
        .strict(),
      tagline: text(20, 220),
      summary: text(20, 200),
      chips: list(text(1, 24), 1, 4),
      image: z.object({ src: heroImage, alt: text(10, 250) }).strict(),
      install: z
        .object({
          // Each label is a tab's value, so two hosts can't share one.
          hosts: list(hostSchema, 1, 3).refine(
            (hosts) =>
              new Set(hosts.map((host) => host.label)).size === hosts.length,
            "each host needs its own label",
          ),
          note: text(1, 200).optional(),
        })
        .strict(),
      highlights: z
        .object({ heading: text(3, 80), items: list(highlightSchema, 3, 6) })
        .strict(),
      howItWorks: z
        .object({
          heading: text(3, 80),
          steps: list(text(10, 260), 2, 6),
          figure: z
            .object({
              src: figureImage,
              alt: text(10, 250),
              caption: text(1, 140).optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
      requirements: z
        .object({
          items: list(text(3, 200), 1, 8),
          config: configSchema.optional(),
        })
        .strict(),
      faq: list(faqSchema, 0, 8).optional(),
      links: list(linkSchema, 0, 8).optional(),
    })
    .strict();
}

export const rawManifestSchema = manifestSchema(z.string(), z.string());

export type RawManifest = z.infer<typeof rawManifestSchema>;

/** The image paths a manifest names, with the field each came from. */
export function manifestImages(
  m: RawManifest,
): { field: "image.src" | "howItWorks.figure.src"; path: string }[] {
  const images: {
    field: "image.src" | "howItWorks.figure.src";
    path: string;
  }[] = [{ field: "image.src", path: m.image.src }];
  if (m.howItWorks.figure !== undefined) {
    images.push({
      field: "howItWorks.figure.src",
      path: m.howItWorks.figure.src,
    });
  }
  return images;
}
