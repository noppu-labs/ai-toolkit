import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveExecutable } from "./resolve-executable.ts";

function makeDir(t: { onTestFinished: (fn: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), "resolve-executable-"));

  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

function addTool(dir: string, name: string, mode = 0o755): string {
  const file = join(dir, name);

  writeFileSync(file, "#!/bin/sh\n", { mode });
  chmodSync(file, mode);

  return file;
}

describe("resolveExecutable", () => {
  it("returns the absolute path from the first PATH entry holding an executable", (t) => {
    const first = makeDir(t);
    const second = makeDir(t);

    addTool(first, "git");
    addTool(second, "git");

    expect(resolveExecutable("git", [second, first].join(delimiter))).toBe(
      join(second, "git"),
    );
    expect(resolveExecutable("git", [first, second].join(delimiter))).toBe(
      join(first, "git"),
    );
  });

  it("skips empty, dot and relative entries even when they hold a match", (t) => {
    const base = makeDir(t);
    const absolute = makeDir(t);

    mkdirSync(join(base, "bin"));
    addTool(join(base, "bin"), "git");
    addTool(absolute, "git");

    const relative = ["", ".", "bin", join(".", "bin")];
    const original = process.cwd();

    t.onTestFinished(() => process.chdir(original));
    process.chdir(base);

    for (const entry of relative) {
      expect(() => resolveExecutable("git", entry)).toThrow(
        "`git` not found on PATH",
      );
    }

    expect(
      resolveExecutable("git", [...relative, absolute].join(delimiter)),
    ).toBe(join(absolute, "git"));
    expect(
      resolveExecutable("git", [absolute, ...relative].join(delimiter)),
    ).toBe(join(absolute, "git"));
  });

  it("skips a non-executable file and a directory with the tool's name", (t) => {
    const plain = makeDir(t);
    const directory = makeDir(t);
    const good = makeDir(t);

    addTool(plain, "git", 0o644);
    mkdirSync(join(directory, "git"));
    addTool(good, "git");

    expect(
      resolveExecutable("git", [plain, directory, good].join(delimiter)),
    ).toBe(join(good, "git"));
    expect(() =>
      resolveExecutable("git", [plain, directory].join(delimiter)),
    ).toThrow("`git` not found on PATH");
  });

  it("throws when no entry qualifies or PATH is undefined", (t) => {
    const empty = makeDir(t);

    expect(() => resolveExecutable("git", empty)).toThrow(
      "`git` not found on PATH",
    );
    expect(() => resolveExecutable("gh", "")).toThrow("`gh` not found on PATH");

    // An explicit undefined takes the default, so unset PATH itself.
    const originalPath = process.env.PATH;

    t.onTestFinished(() => {
      process.env.PATH = originalPath;
    });
    delete process.env.PATH;

    expect(() => resolveExecutable("git")).toThrow("`git` not found on PATH");
    expect(() => resolveExecutable("git", undefined)).toThrow(
      "`git` not found on PATH",
    );
  });

  it("returns the first qualifying absolute directory for any mix of entries", (t) => {
    const withTool = [makeDir(t), makeDir(t)];
    const without = [makeDir(t), makeDir(t)];

    for (const dir of withTool) {
      addTool(dir, "git");
    }

    const entry = fc.oneof(
      fc.constantFrom(...withTool),
      fc.constantFrom(...without),
      fc.constantFrom("", ".", "bin", join(".", "bin")),
    );

    fc.assert(
      fc.property(fc.array(entry, { maxLength: 8 }), (entries) => {
        const expected = entries.find(
          (candidate) => isAbsolute(candidate) && withTool.includes(candidate),
        );
        const pathValue = entries.join(delimiter);

        if (expected === undefined) {
          expect(() => resolveExecutable("git", pathValue)).toThrow(
            "`git` not found on PATH",
          );

          return;
        }

        expect(resolveExecutable("git", pathValue)).toBe(join(expected, "git"));
      }),
    );
  });
});
