import { describe, expect, it } from "vitest";
import { splitInlineCode } from "./inline-code.ts";

describe("splitInlineCode", () => {
  it("splits paired backticks into code runs", () => {
    expect(splitInlineCode("run `a` and `b`")).toEqual([
      { code: false, text: "run " },
      { code: true, text: "a" },
      { code: false, text: " and " },
      { code: true, text: "b" },
    ]);
  });

  it("returns one plain run when there is no code", () => {
    expect(splitInlineCode("no code")).toEqual([
      { code: false, text: "no code" },
    ]);
  });

  it("keeps an unpaired backtick literally", () => {
    expect(splitInlineCode("odd ` tick")).toEqual([
      { code: false, text: "odd ` tick" },
    ]);
  });

  it("keeps an empty pair literally", () => {
    expect(splitInlineCode("``")).toEqual([{ code: false, text: "``" }]);
  });

  it("keeps an unpaired last backtick after a pair", () => {
    expect(splitInlineCode("`a` then `")).toEqual([
      { code: true, text: "a" },
      { code: false, text: " then `" },
    ]);
  });
});
