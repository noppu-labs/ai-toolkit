import { describe, expect, it } from "vitest";
import { buildCommit } from "./build-info.ts";

describe("buildCommit", () => {
  it("is the commit Workers Builds is building", () => {
    expect(buildCommit({ WORKERS_CI_COMMIT_SHA: "a".repeat(40) })).toBe(
      "a".repeat(40),
    );
  });

  it("is null outside a Workers Builds build", () => {
    expect(buildCommit({})).toBeNull();
  });

  it("is null when the value is not a full commit SHA", () => {
    expect(buildCommit({ WORKERS_CI_COMMIT_SHA: "main" })).toBeNull();
  });
});
