import { describe, expect, it } from "vitest";
import { skillPath, skillShareUrl } from "./site.ts";

describe("skillPath", () => {
  it("is the skill's own page, without a trailing slash", () => {
    expect(skillPath("pr-review")).toBe("/skills/pr-review");
  });

  it("encodes the name", () => {
    expect(skillPath("a b&c")).toBe("/skills/a%20b%26c");
  });
});

describe("skillShareUrl", () => {
  it("links to the skill's page on this origin", () => {
    expect(skillShareUrl("pr-review")).toBe(
      `${window.location.origin}/skills/pr-review`,
    );
  });
});
