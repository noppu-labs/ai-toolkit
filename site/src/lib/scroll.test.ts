import { describe, expect, it } from "vitest";
import { hashTarget } from "./scroll.ts";

describe("hashTarget", () => {
  it.each([
    ["", null],
    ["#", null],
    ["#skills", "skills"],
  ])("reads %j as %j", (hash, expected) => {
    expect(hashTarget(hash)).toBe(expected);
  });

  it("decodes a percent-encoded id", () => {
    expect(hashTarget("#caf%C3%A9")).toBe("café");
  });

  it("keeps a malformed escape as written", () => {
    expect(hashTarget("#%E0%A4%A")).toBe("%E0%A4%A");
  });
});
