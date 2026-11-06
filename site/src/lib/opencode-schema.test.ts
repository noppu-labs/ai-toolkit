import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import cacheManagerYaml from "./__fixtures__/opencode-cache-manager.toolkit-page.yaml?raw";
import reviewerYaml from "./__fixtures__/opencode-permission-reviewer.toolkit-page.yaml?raw";
import {
  manifestImages,
  type RawManifest,
  rawManifestSchema,
  YAML_OPTIONS,
} from "./opencode-schema.ts";

function load(source: string): unknown {
  return parse(source, YAML_OPTIONS);
}

function reviewer(): RawManifest {
  return rawManifestSchema.parse(load(reviewerYaml));
}

function configOf(lines: number, trailingNewline = false): string {
  const code = Array.from({ length: lines }, (_, i) => `// ${i}`).join("\n");
  return trailingNewline ? `${code}\n` : code;
}

describe("rawManifestSchema", () => {
  it("accepts both drafts", () => {
    expect(() => rawManifestSchema.parse(load(reviewerYaml))).not.toThrow();
    expect(() => rawManifestSchema.parse(load(cacheManagerYaml))).not.toThrow();
  });

  it("rejects an unknown key", () => {
    const m = reviewer();
    expect(() =>
      rawManifestSchema.parse({ ...m, seo: { ...m.seo, titel: "typo" } }),
    ).toThrow();
  });

  it("rejects a seo.title of 61 characters", () => {
    const m = reviewer();
    expect(() =>
      rawManifestSchema.parse({
        ...m,
        seo: { ...m.seo, title: "x".repeat(61) },
      }),
    ).toThrow();
  });

  it("rejects 7 highlights", () => {
    const m = reviewer();
    const items = [...m.highlights.items, ...m.highlights.items].slice(0, 7);
    expect(items).toHaveLength(7);
    expect(() =>
      rawManifestSchema.parse({ ...m, highlights: { ...m.highlights, items } }),
    ).toThrow();
  });

  it("rejects an http link", () => {
    const m = reviewer();
    expect(() =>
      rawManifestSchema.parse({
        ...m,
        links: [{ label: "Docs", href: "http://example.com/docs" }],
      }),
    ).toThrow();
  });

  it("rejects schemaVersion 2", () => {
    expect(() =>
      rawManifestSchema.parse({ ...reviewer(), schemaVersion: 2 }),
    ).toThrow();
  });

  it("rejects a config of 41 lines and accepts 40", () => {
    const m = reviewer();
    const withConfig = (code: string): unknown => ({
      ...m,
      requirements: {
        ...m.requirements,
        config: { path: "a.jsonc", language: "jsonc", code },
      },
    });
    expect(() => rawManifestSchema.parse(withConfig(configOf(41)))).toThrow();
    expect(() =>
      rawManifestSchema.parse(withConfig(configOf(40, true))),
    ).not.toThrow();
  });

  it("accepts a manifest without faq, links, figure, config or notes", () => {
    const { faq, links, ...rest } = reviewer();
    const { figure, ...howItWorks } = rest.howItWorks;
    const { config, ...requirements } = rest.requirements;
    const { note, ...install } = rest.install;
    const hosts = install.hosts.map(({ note: hostNote, ...host }) => host);
    expect(faq).toBeDefined();
    expect(links).toBeDefined();
    expect(figure).toBeDefined();
    expect(config).toBeDefined();
    expect(note).toBeDefined();
    expect(() =>
      rawManifestSchema.parse({
        ...rest,
        howItWorks,
        requirements,
        install: { hosts },
      }),
    ).not.toThrow();
  });
});

describe("manifestImages", () => {
  it("lists the hero image and the figure", () => {
    expect(manifestImages(reviewer())).toEqual([
      { field: "image.src", path: "images/social-preview.png" },
      { field: "howItWorks.figure.src", path: "images/result-attribution.svg" },
    ]);
  });

  it("lists only the hero image when there is no figure", () => {
    const m = reviewer();
    const { figure: _figure, ...howItWorks } = m.howItWorks;
    expect(manifestImages({ ...m, howItWorks })).toEqual([
      { field: "image.src", path: "images/social-preview.png" },
    ]);
  });
});
