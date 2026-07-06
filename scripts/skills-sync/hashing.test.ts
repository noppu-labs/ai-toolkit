import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect } from "vitest";
import { hashDirectory, hashFiles, listFiles, sha256 } from "./hashing.ts";
import { addSkill, makeRoot } from "./test-helpers.ts";

const SHA256_HEX = /^[0-9a-f]{64}$/;

describe("sha256", () => {
  it("hashes strings and buffers identically", () => {
    expect(sha256("abc")).toBe(sha256(Buffer.from("abc")));
    expect(sha256("abc")).toMatch(SHA256_HEX);
  });
});

describe("listFiles", () => {
  it("returns sorted relative paths including nested files", (t) => {
    const root = makeRoot(t);
    const dir = addSkill(root, "laravel", "demo", {
      "SKILL.md": "# demo",
      "references/b.md": "b",
      "references/a.md": "a",
    });

    expect(listFiles(dir)).toEqual([
      "SKILL.md",
      "references/a.md",
      "references/b.md",
    ]);
  });
});

describe("hashFiles", () => {
  it("is insertion-order independent and content sensitive", () => {
    const a = new Map([
      ["x.md", Buffer.from("one")],
      ["y.md", Buffer.from("two")],
    ]);
    const b = new Map([
      ["y.md", Buffer.from("two")],
      ["x.md", Buffer.from("one")],
    ]);
    const c = new Map([
      ["x.md", Buffer.from("CHANGED")],
      ["y.md", Buffer.from("two")],
    ]);

    expect(hashFiles(a)).toBe(hashFiles(b));
    expect(hashFiles(a)).not.toBe(hashFiles(c));
  });

  it("is not fooled by newline/colon injection in paths", () => {
    const one = Buffer.from("one");
    const two = Buffer.from("two");
    const honest = new Map([
      ["a", one],
      ["b", two],
    ]);
    // Under the old `path:sha256(content)` serialization, this single file
    // produced the same digest input as the two honest files above.
    const forged = new Map([[`a:${sha256(one)}\nb`, two]]);

    expect(hashFiles(honest)).not.toBe(hashFiles(forged));
  });

  // Property: deterministic sha256-hex digest regardless of insertion order.
  it.prop([
    fc.uniqueArray(fc.tuple(fc.string(), fc.uint8Array()), {
      selector: (entry: [string, Uint8Array]): string => entry[0],
    }),
  ])("is deterministic and insertion-order independent", (entries) => {
    const forward = new Map<string, Buffer>(
      entries.map(([path, content]) => [path, Buffer.from(content)]),
    );
    const reversed = new Map<string, Buffer>(
      [...entries]
        .reverse()
        .map(([path, content]) => [path, Buffer.from(content)]),
    );
    const hash = hashFiles(forward);

    return hash === hashFiles(reversed) && SHA256_HEX.test(hash);
  });

  // Property behind the sync-state security invariant: hashing sha256(path)
  // and sha256(content) separately means any change to a file set changes the
  // digest. Mutating a single content byte must change the hash.
  it.prop([
    fc.uniqueArray(fc.tuple(fc.string(), fc.uint8Array({ minLength: 1 })), {
      minLength: 1,
      selector: (entry: [string, Uint8Array]): string => entry[0],
    }),
  ])("is sensitive to content changes", (entries) => {
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
});

describe("hashDirectory", () => {
  it("changes when a file changes or is added", (t) => {
    const root = makeRoot(t);
    const dir = addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" });
    const before = hashDirectory(dir);

    writeFileSync(join(dir, "SKILL.md"), "# demo edited");

    const afterEdit = hashDirectory(dir);

    expect(afterEdit).not.toBe(before);

    writeFileSync(join(dir, "references.md"), "new file");

    expect(hashDirectory(dir)).not.toBe(afterEdit);
  });
});
