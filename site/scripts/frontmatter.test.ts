import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter.ts";

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

  test.prop([fc.dictionary(KEY_ARB, VALUE_ARB, { minKeys: 1, maxKeys: 5 })])(
    "round-trips serialized fields",
    (fields) => {
      const lines = Object.entries(fields).map(
        ([key, value]) => `${key}: ${value}`,
      );
      const doc = `---\n${lines.join("\n")}\n---\nbody text\n`;
      // biome-ignore lint/suspicious/noMisplacedAssertion: expect runs inside @fast-check/vitest's test.prop
      expect(parseFrontmatter(doc, "prop/SKILL.md")).toEqual(fields);
    },
  );
});
