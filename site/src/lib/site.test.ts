import { describe, expect, it } from "vitest";
import { skillShareUrl } from "./site.ts";

describe("skillShareUrl", () => {
  it("links to the catalog on this origin with the skill open", () => {
    expect(skillShareUrl("pr-review")).toBe(
      `${window.location.origin}/?skill=pr-review#skills`,
    );
  });

  it("encodes the name", () => {
    expect(skillShareUrl("a b&c")).toBe(
      `${window.location.origin}/?skill=a+b%26c#skills`,
    );
  });
});
