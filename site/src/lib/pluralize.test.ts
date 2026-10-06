import { describe, expect, it } from "vitest";
import { pluralize } from "./pluralize.ts";

describe("pluralize", () => {
  it("keeps the noun singular for one", () => {
    expect(pluralize(1, "skill")).toBe("1 skill");
  });

  it("adds an s for zero", () => {
    expect(pluralize(0, "skill")).toBe("0 skills");
  });

  it("adds an s for more than one", () => {
    expect(pluralize(2, "skill")).toBe("2 skills");
  });
});
