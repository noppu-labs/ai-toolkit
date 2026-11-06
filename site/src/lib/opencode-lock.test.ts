import { describe, expect, it } from "vitest";
import {
  lockEntrySchema,
  lockSchema,
  lockSourcesSchema,
} from "./opencode-lock.ts";

const ENTRY = {
  repo: "noppu-labs/opencode-x",
  package: "@noppu-labs/opencode-x",
  version: "1.2.3",
  tag: "v1.2.3",
  commit: "a".repeat(40),
  license: "MIT",
  files: { "docs/toolkit-page.yaml": "b".repeat(64) },
};

describe("lockSchema", () => {
  it("parses a full entry", () => {
    expect(lockEntrySchema.parse(ENTRY)).toEqual(ENTRY);
  });

  it("parses an entry with a ref", () => {
    expect(lockEntrySchema.parse({ ...ENTRY, ref: "feat/x" }).ref).toBe(
      "feat/x",
    );
  });

  it("rejects a 39-character commit", () => {
    expect(() =>
      lockEntrySchema.parse({ ...ENTRY, commit: "a".repeat(39) }),
    ).toThrow();
  });

  it("rejects an unknown key", () => {
    expect(() => lockEntrySchema.parse({ ...ENTRY, extra: 1 })).toThrow();
  });

  it("rejects a plugin key that is not a lowercase slug", () => {
    expect(() =>
      lockSchema.parse({
        lockfileVersion: 1,
        plugins: { Opencode_X: ENTRY },
      }),
    ).toThrow();
  });

  it("accepts a lockfile with a valid plugin key", () => {
    expect(
      lockSchema.parse({ lockfileVersion: 1, plugins: { "opencode-x": ENTRY } })
        .plugins["opencode-x"],
    ).toEqual(ENTRY);
  });
});

describe("lockSourcesSchema", () => {
  it("accepts repo and package alone", () => {
    const sources = {
      lockfileVersion: 1,
      plugins: {
        "opencode-x": {
          repo: "noppu-labs/opencode-x",
          package: "@noppu-labs/opencode-x",
        },
      },
    };
    expect(lockSourcesSchema.parse(sources)).toEqual(sources);
  });
});
