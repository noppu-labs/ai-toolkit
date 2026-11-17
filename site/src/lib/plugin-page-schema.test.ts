import { describe, expect, it } from "vitest";
import { FIXTURE_PLUGIN_COPY } from "../test/plugin-copy.ts";
import { copyTexts, pluginPageSchema } from "./plugin-page-schema.ts";

describe("pluginPageSchema", () => {
  const parse = (copy: unknown): boolean =>
    pluginPageSchema.safeParse(copy).success;

  it("accepts the fixture", () => {
    expect(parse(FIXTURE_PLUGIN_COPY)).toBe(true);
  });

  it("rejects an unknown key", () => {
    expect(parse({ ...FIXTURE_PLUGIN_COPY, summary: "x".repeat(30) })).toBe(
      false,
    );
  });

  it("rejects fewer than three questions", () => {
    expect(
      parse({
        ...FIXTURE_PLUGIN_COPY,
        faq: FIXTURE_PLUGIN_COPY.faq.slice(0, 2),
      }),
    ).toBe(false);
  });

  it("rejects a missing faq", () => {
    const { faq: _faq, ...rest } = FIXTURE_PLUGIN_COPY;

    expect(parse(rest)).toBe(false);
  });

  it("rejects an seo description under 70 characters", () => {
    expect(
      parse({
        ...FIXTURE_PLUGIN_COPY,
        seo: { ...FIXTURE_PLUGIN_COPY.seo, description: "x".repeat(69) },
      }),
    ).toBe(false);
  });

  it("accepts an seo title of 47 characters", () => {
    expect(
      parse({
        ...FIXTURE_PLUGIN_COPY,
        seo: { ...FIXTURE_PLUGIN_COPY.seo, title: "x".repeat(47) },
      }),
    ).toBe(true);
  });

  it("rejects an seo title of 48 characters", () => {
    expect(
      parse({
        ...FIXTURE_PLUGIN_COPY,
        seo: { ...FIXTURE_PLUGIN_COPY.seo, title: "x".repeat(48) },
      }),
    ).toBe(false);
  });

  it("rejects fewer than three highlights", () => {
    expect(
      parse({
        ...FIXTURE_PLUGIN_COPY,
        highlights: {
          ...FIXTURE_PLUGIN_COPY.highlights,
          items: FIXTURE_PLUGIN_COPY.highlights.items.slice(0, 2),
        },
      }),
    ).toBe(false);
  });
});

describe("copyTexts", () => {
  const texts = copyTexts(FIXTURE_PLUGIN_COPY);

  it("contains the page's prose", () => {
    expect(texts).toContain(FIXTURE_PLUGIN_COPY.title);
    expect(texts).toContain(FIXTURE_PLUGIN_COPY.tagline);
    expect(texts).toContain(FIXTURE_PLUGIN_COPY.howItWorks.steps[0]);
    expect(texts).toContain(FIXTURE_PLUGIN_COPY.faq[0]?.q);
    expect(texts).toContain(FIXTURE_PLUGIN_COPY.faq[0]?.a);
  });

  it("contains the highlight and link labels the page renders", () => {
    const [link] = FIXTURE_PLUGIN_COPY.links ?? [];

    expect(texts).toContain(FIXTURE_PLUGIN_COPY.highlights.items[0]?.label);
    expect(texts).toContain(link?.label);
  });

  it("does not contain a link's href", () => {
    const [link] = FIXTURE_PLUGIN_COPY.links ?? [];

    expect(link).toBeDefined();
    expect(texts).not.toContain(link?.href);
  });
});
