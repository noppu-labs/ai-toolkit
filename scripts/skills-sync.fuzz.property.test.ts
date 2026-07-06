// Fuzz-style property tests (fast-check) over the untrusted-input functions:
// CLI arg parsing, lock-file JSON parsing, and the path-injection-resistant
// file hasher. Properties return booleans so fast-check reports the shrunken
// counterexample on failure.
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { hashFiles, PLUGINS, parseLock, parseSkillArg } from "./skills-sync.ts";

// parseSkillArg is total: every input either yields a valid {plugin, name}
// (plugin in PLUGINS, non-empty name) or throws an Error — never any other
// failure mode.
test.prop([fc.option(fc.string(), { nil: undefined })])(
  "parseSkillArg yields a valid pair or throws an Error",
  (arg) => {
    try {
      const { plugin, name } = parseSkillArg(arg);
      return PLUGINS.includes(plugin) && name.length > 0;
    } catch (error) {
      return error instanceof Error;
    }
  },
);

// parseLock never crashes with anything other than a SyntaxError on arbitrary
// bytes (JSON.parse's own failure mode); it must not throw TypeError/etc.
test.prop([fc.string()])(
  "parseLock only ever throws SyntaxError on arbitrary input",
  (text) => {
    try {
      parseLock(text);
      return true;
    } catch (error) {
      return error instanceof SyntaxError;
    }
  },
);

// Round-trip: any object serialized as JSON parses back to a deep-equal value.
test.prop([fc.jsonValue()])(
  "parseLock round-trips JSON-serialized values",
  (value) =>
    JSON.stringify(parseLock(JSON.stringify(value))) === JSON.stringify(value),
);

// Security invariant behind skills-sync.ts:92 — hashing sha256(path) and
// sha256(content) separately means any change to a file set changes the digest.
// Mutating a single content byte (or adding an entry) must change the hash.
test.prop([
  fc.uniqueArray(fc.tuple(fc.string(), fc.uint8Array({ minLength: 1 })), {
    minLength: 1,
    selector: (entry: [string, Uint8Array]): string => entry[0],
  }),
])("hashFiles is sensitive to content changes", (entries) => {
  const base = new Map<string, Buffer>(
    entries.map(([path, content]) => [path, Buffer.from(content)]),
  );
  const first = entries[0];
  if (first === undefined) {
    return true; // unreachable: minLength:1 guarantees at least one entry
  }
  const [firstPath, firstContent] = first;
  const mutated = new Map(base);
  const flipped = Uint8Array.from(firstContent);
  if (flipped[0] !== undefined) {
    flipped[0] ^= 0xff;
  }
  mutated.set(firstPath, Buffer.from(flipped));
  return hashFiles(base) !== hashFiles(mutated);
});
