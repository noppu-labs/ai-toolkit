import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errors.ts";

describe("getErrorMessage", () => {
  it("returns the message for Error instances", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-Error values", () => {
    expect(getErrorMessage("plain string")).toBe("plain string");
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(undefined)).toBe("undefined");
  });
});
