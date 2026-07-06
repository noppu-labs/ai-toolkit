import { describe, expect, it } from "vitest";
import { requireEntry } from "./test-helpers.ts";

describe("requireEntry", () => {
  it("throws for a name missing from the lock", () => {
    expect(() => requireEntry({ version: 1, skills: {} }, "ghost")).toThrow(
      /ghost missing from lock/,
    );
  });
});
