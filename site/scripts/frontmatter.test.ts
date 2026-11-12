import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseFrontmatter, splitFrontmatter } from "./frontmatter.ts";

const KEY_ARB = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);
const VALUE_ARB = fc.stringMatching(
  /^[A-Za-z0-9][A-Za-z0-9 ,.:()/'-]{0,80}[A-Za-z0-9)]$/,
);

describe("parseFrontmatter", () => {
  it("parses a real SKILL.md header", () => {
    const doc = [
      "---",
      "name: laravel-dtos",
      "description: Data Transfer Objects using Spatie Laravel Data. Use when creating DTOs.",
      "---",
      "",
      "# Laravel DTOs",
    ].join("\n");

    expect(
      parseFrontmatter(doc, "laravel/skills/laravel-dtos/SKILL.md"),
    ).toEqual({
      name: "laravel-dtos",
      description:
        "Data Transfer Objects using Spatie Laravel Data. Use when creating DTOs.",
    });
  });

  it("keeps colons inside values intact", () => {
    const doc = "---\ndescription: Use when: always\n---\n";
    expect(parseFrontmatter(doc, "x.md")).toEqual({
      description: "Use when: always",
    });
  });

  it("returns an empty record for an empty frontmatter block", () => {
    expect(parseFrontmatter("---\n---\n", "d/SKILL.md")).toEqual({});
  });

  it("throws when the opening delimiter is missing", () => {
    expect(() => parseFrontmatter("# no frontmatter", "a/SKILL.md")).toThrow(
      /a\/SKILL\.md/,
    );
  });

  it("throws when the closing delimiter is missing", () => {
    expect(() => parseFrontmatter("---\nname: x\n", "b/SKILL.md")).toThrow(
      /b\/SKILL\.md/,
    );
  });

  it("throws on a line without a colon", () => {
    expect(() =>
      parseFrontmatter("---\njust words\n---\n", "c/SKILL.md"),
    ).toThrow(/c\/SKILL\.md/);
  });

  it("round-trips serialized fields", () => {
    fc.assert(
      fc.property(
        fc.dictionary(KEY_ARB, VALUE_ARB, { minKeys: 1, maxKeys: 5 }),
        (fields) => {
          const lines = Object.entries(fields).map(
            ([key, value]) => `${key}: ${value}`,
          );
          const doc = `---\n${lines.join("\n")}\n---\nbody text\n`;
          expect(parseFrontmatter(doc, "prop/SKILL.md")).toEqual(fields);
        },
      ),
    );
  });
});

describe("splitFrontmatter", () => {
  it("returns the header's fields and everything after the closing fence", () => {
    expect(
      splitFrontmatter("---\nname: a\n---\n\n# A\n", "a/SKILL.md"),
    ).toEqual({ fields: { name: "a" }, body: "\n# A\n" });
  });

  it("closes an empty header and a header at the end of the file", () => {
    expect(splitFrontmatter("---\n---\nbody", "e/SKILL.md")).toEqual({
      fields: {},
      body: "body",
    });
    expect(splitFrontmatter("---\nname: a\n---", "f/SKILL.md")).toEqual({
      fields: { name: "a" },
      body: "",
    });
  });

  it("does not take a longer rule for the closing fence", () => {
    expect(
      splitFrontmatter("---\nname: a\n---\nabove\n\n----\nbelow", "g/SKILL.md")
        .body,
    ).toBe("above\n\n----\nbelow");
    expect(() =>
      splitFrontmatter("---\nname: a\n----\nbody", "h/SKILL.md"),
    ).toThrow(/h\/SKILL\.md: missing frontmatter closing delimiter/);
  });

  it("throws with the file's path when the closing fence is missing", () => {
    expect(() => splitFrontmatter("---\nname: a\n", "i/SKILL.md")).toThrow(
      /i\/SKILL\.md: missing frontmatter closing delimiter/,
    );
  });
});
