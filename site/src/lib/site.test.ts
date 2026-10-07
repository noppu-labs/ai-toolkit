import { describe, expect, it } from "vitest";
import { SITE_URL, skillShareUrl } from "./site.ts";

describe("skillShareUrl", () => {
  it("links to the catalog with the skill open", () => {
    expect(skillShareUrl("pr-review")).toBe(
      "https://toolkit.noppu.com/?skill=pr-review#skills",
    );
  });

  it("starts from the site URL and encodes the name", () => {
    expect(skillShareUrl("a b&c")).toBe(`${SITE_URL}/?skill=a+b%26c#skills`);
  });
});
