// Property-based tests (fast-check) for the functions that process
// third-party content: lock entries, upstream file listings, and upstream
// blobs fetched from external repos.
import { strict as assert } from "node:assert";
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { classify, fetchUpstream, hashFiles } from "./skills-sync.mjs";

const STATUSES = [
  "local",
  "diverged",
  "upstream-updated",
  "locally-modified",
  "up-to-date",
];

const maybeString = fc.option(fc.string(), { nil: undefined });

const lockEntry = fc.record(
  {
    sourceType: fc.string(),
    upstreamHash: maybeString,
    vendoredHash: maybeString,
  },
  { requiredKeys: [] },
);

test.prop([lockEntry, maybeString, maybeString])(
  "classify returns a known status for arbitrary lock entries",
  (entry, vendoredNow, upstreamNow) => {
    assert.ok(STATUSES.includes(classify(entry, vendoredNow, upstreamNow)));
  },
);

test.prop([
  fc.uniqueArray(fc.tuple(fc.string(), fc.uint8Array()), {
    selector: (entry) => entry[0],
  }),
])("hashFiles is deterministic and insertion-order independent", (entries) => {
  const forward = new Map(
    entries.map(([path, content]) => [path, Buffer.from(content)]),
  );
  const reversed = new Map(
    [...entries]
      .reverse()
      .map(([path, content]) => [path, Buffer.from(content)]),
  );
  const hash = hashFiles(forward);
  assert.equal(hash, hashFiles(reversed));
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test.prop([fc.string({ minLength: 1 }), fc.string()])(
  "fetchUpstream tolerates arbitrary upstream listings and blobs",
  (name, content) => {
    const hostileGh = (path) => {
      if (path.includes("/commits/")) {
        return { sha: "0000000000000000000000000000000000000000" };
      }
      if (path.includes("/contents/")) {
        return [{ path: `s/${name}`, sha: "b1", type: "file" }];
      }
      return { content };
    };
    const result = fetchUpstream(
      { ref: "main", skillPath: "s", source: "o/r" },
      hostileGh,
    );
    assert.equal(result.files.size, 1);
    assert.match(result.hash, /^[0-9a-f]{64}$/);
  },
);
