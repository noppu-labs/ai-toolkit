import { it } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect } from "vitest";
import { classify, parseLock, readLock, writeLock } from "./lockfile.ts";
import { makeRoot } from "./test-helpers.ts";
import type { SyncState } from "./types.ts";

const STATUSES: SyncState[] = [
  "local",
  "diverged",
  "upstream-updated",
  "locally-modified",
  "up-to-date",
];

const maybeString = fc.option(fc.string(), { nil: undefined });

describe("parseLock", () => {
  // Property: parseLock never crashes with anything other than a SyntaxError
  // on arbitrary bytes (JSON.parse's own failure mode) — never TypeError/etc.
  it.prop([fc.string()])(
    "only ever throws SyntaxError on arbitrary input",
    (text) => {
      try {
        parseLock(text);

        return true;
      } catch (error) {
        return error instanceof SyntaxError;
      }
    },
  );

  // Property: any object serialized as JSON parses back to a deep-equal value.
  it.prop([fc.jsonValue()])(
    "round-trips JSON-serialized values",
    (value) =>
      JSON.stringify(parseLock(JSON.stringify(value))) ===
      JSON.stringify(value),
  );
});

describe("writeLock", () => {
  it("round-trips through readLock", (t) => {
    const root = makeRoot(t);
    const lock = { version: 1, skills: { demo: { sourceType: "local" } } };

    writeLock(root, "laravel", lock);

    expect(readLock(root, "laravel")).toEqual(lock);
  });
});

describe("classify", () => {
  it("covers all five states", () => {
    expect(classify({ sourceType: "local" }, "x", "y")).toBe("local");

    const entry = {
      sourceType: "github",
      vendoredHash: "v1",
      upstreamHash: "u1",
    };

    expect(classify(entry, "v1", "u1")).toBe("up-to-date");
    expect(classify(entry, "v1", "u2")).toBe("upstream-updated");
    expect(classify(entry, "v2", "u1")).toBe("locally-modified");
    expect(classify(entry, "v2", "u2")).toBe("diverged");
  });

  // Property: total over arbitrary lock entries — always one of the five
  // known states, never a crash or an out-of-domain value.
  it.prop([
    fc.record(
      {
        sourceType: fc.string(),
        upstreamHash: maybeString,
        vendoredHash: maybeString,
      },
      { requiredKeys: [] },
    ),
    maybeString,
    maybeString,
  ])(
    "returns a known status for arbitrary lock entries",
    (entry, vendoredNow, upstreamNow) =>
      STATUSES.includes(classify(entry, vendoredNow, upstreamNow)),
  );
});
