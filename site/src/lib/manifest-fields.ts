import { z } from "astro/zod";

/** A trimmed, non-empty string with a length range. */
export function text(min: number, max: number): z.ZodString {
  return z.string().trim().min(min).max(max);
}

export function list<T extends z.ZodType>(
  item: T,
  min: number,
  max: number,
): z.ZodArray<T> {
  return z.array(item).min(min).max(max);
}

export const highlightSchema = z
  .object({ label: text(1, 16), title: text(3, 60), body: text(10, 260) })
  .strict();

export const faqSchema = z
  .object({ q: text(5, 120), a: text(10, 400) })
  .strict();

export const linkSchema = z
  .object({
    label: text(1, 40),
    href: z.url().startsWith("https://"),
  })
  .strict();
