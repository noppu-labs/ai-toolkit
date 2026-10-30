import { describe, expect, it } from "vitest";
import { canonicalUrl } from "./head.ts";

describe("canonicalUrl", () => {
  it("names the page on production, with no trailing slash past the root", () => {
    expect(canonicalUrl("/")).toBe("https://toolkit.noppu.com/");
    expect(canonicalUrl("/skills/deep")).toBe(
      "https://toolkit.noppu.com/skills/deep",
    );
  });
});
