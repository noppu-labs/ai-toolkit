import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { git } from "./fixtures/investigate-git.ts";
import type { Sym } from "./fixtures/investigate-types.ts";

type RepoModule = {
  TS_EXT_RE: RegExp;
  compareCodeUnits: (a: string, b: string) => number;
  collectFiles: (p: string, env?: NodeJS.ProcessEnv) => string[];
  tsExports: (text: string) => string[];
  deriveSymbols: (
    files: string[],
    repoRoot: string,
    maxSymbols: number,
  ) => { symbols: Sym[]; truncated: boolean };
  resolveRepo: (targetArg: string) => {
    target: string;
    repoRoot: string;
    repoName: string;
    relTarget: string;
  };
};

type ExecModule = {
  probe: (cmd: string, env?: NodeJS.ProcessEnv) => boolean;
  run: (
    cmd: string,
    args: string[],
    opts?: { cwd?: string },
  ) => { status: number | null; stdout: string };
};

const libDir: string = join(
  import.meta.dirname,
  "..",
  "investigate",
  "skills",
  "brief",
  "scripts",
  "lib",
);

const repo: RepoModule = (await import(
  pathToFileURL(join(libDir, "repo.mjs")).href
)) as RepoModule;
const exec: ExecModule = (await import(
  pathToFileURL(join(libDir, "exec.mjs")).href
)) as ExecModule;

// pre-S8786 patterns, kept to prove the rewrite is equivalent
const OLD_IDENT_RE = /^[A-Za-z_$][\w$]*$/;
const OLD_EXPORT_RE =
  /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\s*\*?|class|const\s+enum|const|let|var|enum|type|interface|abstract\s+class)\s+([A-Za-z_$][\w$]*)/gm;
const OLD_EXPORT_LIST_RE =
  /^\s*export\s+(?:type\s+)?\{([^}]*)\}(?!\s*from\b)/gm;
const OLD_DEFAULT_IDENT_RE =
  /^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/gm;
const OLD_CJS_DEFAULT_RE =
  /^\s*module\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;?\s*$/gm;
const OLD_CJS_NAMED_RE = /^\s*(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/gm;

function oldListNames(body: string): string[] {
  return body
    .split(",")
    .map((item) =>
      item
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .at(-1),
    )
    .filter(
      (name): name is string =>
        !!name && name !== "default" && OLD_IDENT_RE.test(name),
    );
}

// tsExports as it stood, driven by the old patterns: ordering and dedupe are
// part of what the rewrite must preserve.
function getOldTsExports(text: string): string[] {
  const hits: { at: number; names: string[] }[] = [];
  for (const re of [
    OLD_EXPORT_RE,
    OLD_DEFAULT_IDENT_RE,
    OLD_CJS_DEFAULT_RE,
    OLD_CJS_NAMED_RE,
  ]) {
    for (const m of text.matchAll(re))
      hits.push({ at: m.index, names: [m[1] ?? ""] });
  }
  for (const m of text.matchAll(OLD_EXPORT_LIST_RE)) {
    hits.push({ at: m.index, names: oldListNames(m[1] ?? "") });
  }
  const names: string[] = [];
  for (const name of hits.sort((a, b) => a.at - b.at).flatMap((h) => h.names)) {
    if (name && !names.includes(name)) names.push(name);
  }

  return names;
}

function gitInit(prefix: string): string {
  const cwd = mkdtempSync(join(tmpdir(), prefix));
  git(cwd, "init", "-q", "-b", "main");
  return cwd;
}

function makeRepo(): string {
  const cwd = gitInit("investigate-repo-");
  mkdirSync(join(cwd, "app", "Services"), { recursive: true });
  mkdirSync(join(cwd, "src", "lib"), { recursive: true });
  mkdirSync(join(cwd, "tests", "Unit"), { recursive: true });
  mkdirSync(join(cwd, "app", "Services", ".hidden"), { recursive: true });
  writeFileSync(
    join(cwd, "app", "Services", "Invoice.php"),
    "<?php\nclass Invoice {}\n",
  );
  writeFileSync(join(cwd, "app", "Services", "index.php"), "<?php\n");
  writeFileSync(join(cwd, "app", "Services", ".hidden", "X.php"), "<?php\n");
  writeFileSync(
    join(cwd, "app", "Services", "Invoice.test.ts"),
    "export const a = 1;\n",
  );
  writeFileSync(
    join(cwd, "src", "lib", "commands.ts"),
    "export function formatDate(d: Date): string { return d.toISOString(); }\nexport const parseDate = (s: string): Date => new Date(s);\nconst hidden = 1;\nexport default function main() {}\n",
  );
  writeFileSync(join(cwd, "src", "lib", "README.md"), "# nope\n");
  writeFileSync(join(cwd, "tests", "Unit", "InvoiceTest.php"), "<?php\n");
  return cwd;
}

describe("collectFiles", () => {
  it("keeps source files and drops tests, hidden dirs, and non-source files", () => {
    const cwd = makeRepo();
    const files = repo.collectFiles(join(cwd, "app", "Services"));
    expect(files).toEqual([
      join(cwd, "app", "Services", "Invoice.php"),
      join(cwd, "app", "Services", "index.php"),
    ]);
  });

  it("collects files when the repo lives under an ancestor directory named tests", () => {
    const base = mkdtempSync(join(tmpdir(), "investigate-ancestor-"));
    const cwd = join(base, "tests", "repo");
    mkdirSync(join(cwd, "app", "Services"), { recursive: true });
    git(cwd, "init", "-q", "-b", "main");
    mkdirSync(join(cwd, "tests", "Unit"), { recursive: true });
    writeFileSync(join(cwd, "app", "Services", "Invoice.php"), "<?php\n");
    writeFileSync(join(cwd, "tests", "Unit", "InvoiceTest.php"), "<?php\n");
    expect(repo.collectFiles(join(cwd, "app", "Services"))).toEqual([
      join(cwd, "app", "Services", "Invoice.php"),
    ]);
    expect(repo.collectFiles(cwd)).toEqual([
      join(cwd, "app", "Services", "Invoice.php"),
    ]);
    expect(
      repo.collectFiles(join(cwd, "app", "Services", "Invoice.php")),
    ).toEqual([join(cwd, "app", "Services", "Invoice.php")]);
  });

  it("keeps .mjs, .cjs, .mts, and .cts sources and drops their test variants", () => {
    const cwd = gitInit("investigate-modext-");
    for (const f of [
      "a.mjs",
      "b.cjs",
      "c.mts",
      "d.cts",
      "a.test.mjs",
      "b.spec.cjs",
      "c.test.mts",
      "d.stories.cts",
    ]) {
      writeFileSync(join(cwd, f), "export const value = 1;\n");
    }
    expect(repo.collectFiles(cwd)).toEqual(
      ["a.mjs", "b.cjs", "c.mts", "d.cts"].map((f) => join(cwd, f)),
    );
    expect(repo.collectFiles(join(cwd, "a.test.mjs"))).toEqual([]);
  });

  it("skips gitignored files, symlinks, and symlink loops without throwing", () => {
    const cwd = gitInit("investigate-links-");
    mkdirSync(join(cwd, "src", "gen"), { recursive: true });
    writeFileSync(join(cwd, ".gitignore"), "src/gen/\n");
    writeFileSync(join(cwd, "src", "real.ts"), "export const real = 1;\n");
    writeFileSync(join(cwd, "src", "gen", "out.ts"), "export const gen = 1;\n");
    symlinkSync(join(cwd, "missing.ts"), join(cwd, "src", "dangling.ts"));
    symlinkSync(join(cwd, "src", "real.ts"), join(cwd, "src", "alias.ts"));
    symlinkSync(cwd, join(cwd, "src", "loop"));
    expect(repo.collectFiles(join(cwd, "src"))).toEqual([
      join(cwd, "src", "real.ts"),
    ]);
  });

  it("throws when the directory is not inside a git repository", () => {
    const plain = mkdtempSync(join(tmpdir(), "investigate-nogit-files-"));
    writeFileSync(join(plain, "a.ts"), "export const a = 1;\n");
    expect(() => repo.collectFiles(plain)).toThrow(/git ls-files failed/);
  });

  it("returns a single file when given a file", () => {
    const cwd = makeRepo();
    const f = join(cwd, "src", "lib", "commands.ts");
    expect(repo.collectFiles(f)).toEqual([f]);
  });
});

describe("tsExports", () => {
  it("lists exported declarations in order, skipping non-exports and anonymous default", () => {
    expect(
      repo.tsExports(
        "export function formatDate() {}\nexport const parseDate = 1;\nconst hidden = 1;\nexport default function () {}\nexport class Store {}\nexport type Row = 1;\nexport interface Shape {}\nexport enum Color {}\nexport async function load() {}\nexport default function main() {}\n",
      ),
    ).toEqual([
      "formatDate",
      "parseDate",
      "Store",
      "Row",
      "Shape",
      "Color",
      "load",
      "main",
    ]);
  });

  it("names const enums and declared exports", () => {
    expect(
      repo.tsExports(
        "export const enum Dir {}\nexport declare function foo(): void;\nexport declare const bar: number;\n",
      ),
    ).toEqual(["Dir", "foo", "bar"]);
  });

  it("names export lists, default identifiers, and CommonJS exports", () => {
    expect(
      repo.tsExports(
        "const Button = 1;\nexport { Button, buttonVariants as variants, Card as default };\nexport type { Props };\nexport { reexported } from './x';\nexport default Widget;\nmodule.exports = Legacy;\nexports.helper = 1;\nmodule.exports.other = 2;\n",
      ),
    ).toEqual([
      "Button",
      "variants",
      "Props",
      "Widget",
      "Legacy",
      "helper",
      "other",
    ]);
  });

  it("dedupes repeated names", () => {
    expect(
      repo.tsExports("export const a = 1;\nexport { a };\nexport const a = 2;"),
    ).toEqual(["a"]);
  });

  it("names exports indented with tabs, after blank lines, with CRLF endings, or after a BOM", () => {
    expect(
      repo.tsExports(
        "\u{feff}export const first = 1;\r\n\r\n\r\n\texport const alpha = 1;\r\n\n  \n\t export function* gen() {}\r\n\t\texport { beta, type Gamma as delta }\r\n\r\n\tmodule.exports = Legacy;\r\n",
      ),
    ).toEqual(["first", "alpha", "gen", "beta", "delta", "Legacy"]);
  });

  it("names export list items through type modifiers, renames, wide gaps, trailing commas and default", () => {
    expect(
      repo.tsExports(
        "export {  a ,  type   B  as   c,\tdefault as d, e as default ,\n  f\tas\tg,  }\n",
      ),
    ).toEqual(["a", "c", "d", "g"]);
  });

  const indents = fc.string({
    unit: fc.constantFrom(" ", "\t", "\u{feff}", "\u{a0}", "\v", "\f"),
    maxLength: 3,
  });
  const lineEnds = fc.constantFrom("\n", "\r\n", "\r", "\u{2028}");
  const fragments = fc.constantFrom(
    "",
    "export const foo = 1",
    "export function* gen() {}",
    "export function\t*\tgen2() {}",
    "export function*gen3() {}",
    "export function *  (",
    "export function  (",
    "export async function load() {}",
    "export const enum Dir {}",
    "export declare const bar: number;",
    "export abstract class Shape {}",
    "export default class Store {}",
    "export default class",
    "Later {}",
    "export default Widget;",
    "export default Widget ;  ",
    "export default Widget   other",
    ";",
    "export { a, type b as c }",
    "export type { Props }",
    "export {",
    "  first, // first as alias",
    "  second as renamed,",
    "}",
    'export { x } from "./y"',
    "module.exports = thing;",
    "module.exports = thing   ;  ",
    "module.exports.other = 2",
    "exports.name =",
    "exports.spaced   = 1",
    "const hidden = 1",
  );

  it("matches the pre-S8786 patterns on any mix of export lines", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(indents, fragments, indents, lineEnds), {
          maxLength: 12,
        }),
        (lines) => {
          const text = lines
            .map(
              ([lead, fragment, trail, end]) => lead + fragment + trail + end,
            )
            .join("");

          expect(repo.tsExports(text)).toEqual(getOldTsExports(text));
        },
      ),
    );
  });

  const gaps = fc.string({
    unit: fc.constantFrom(" ", "\t", "\n"),
    minLength: 1,
    maxLength: 4,
  });
  const idents = fc.oneof(
    fc.constantFrom("default", "as", "type", "foo", "Bar"),
    fc.stringMatching(/^[A-Za-z_$][\w$]{0,4}$/),
  );
  const listItems = fc
    .tuple(fc.boolean(), idents, fc.option(idents), gaps, gaps, gaps)
    .map(
      ([typed, name, alias, g1, g2, g3]) =>
        (typed ? `type${g1}` : "") +
        name +
        (alias === null ? "" : `${g2}as${g3}${alias}`),
    );

  it("names the same export list items as the pre-S8786 split", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(listItems, gaps), { minLength: 1, maxLength: 6 }),
        fc.boolean(),
        (items, trailingComma) => {
          const body =
            items.map(([item, gap]) => item + gap).join(",") +
            (trailingComma ? "," : "");
          const text = `export {${body}}\n`;

          expect(repo.tsExports(text)).toEqual(getOldTsExports(text));
        },
      ),
    );
  });

  it("names the same items as the pre-S8786 split for malformed list items", () => {
    const words = fc.constantFrom("a", "as", "type", "//", "default", "x1");
    const junk = fc
      .array(fc.tuple(words, gaps), { minLength: 1, maxLength: 6 })
      .map((parts) => parts.map(([word, gap]) => word + gap).join(""));

    fc.assert(
      fc.property(fc.array(junk, { minLength: 1, maxLength: 4 }), (items) => {
        const text = `export { ${items.join(",")} }\n`;

        expect(repo.tsExports(text)).toEqual(getOldTsExports(text));
      }),
    );
  });
});

describe("compareCodeUnits", () => {
  it("sorts in the same order as the default sort", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: "binary" })), (items) => {
        expect([...items].sort(repo.compareCodeUnits)).toEqual(
          [...items].sort(),
        );
      }),
    );
  });
});

describe("TS_EXT_RE", () => {
  it("matches every JS/TS module variant and nothing else", () => {
    for (const f of [
      "a.ts",
      "a.tsx",
      "a.js",
      "a.jsx",
      "a.mjs",
      "a.cjs",
      "a.mts",
      "a.cts",
    ]) {
      expect(repo.TS_EXT_RE.test(f)).toBe(true);
    }
    for (const f of ["a.php", "a.json", "a.mtsx", "a.d", "a.cs"]) {
      expect(repo.TS_EXT_RE.test(f)).toBe(false);
    }
  });
});

describe("deriveSymbols", () => {
  it("names the exports of a .mjs file", () => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-mjs-"));
    const file = join(cwd, "render-comments.mjs");
    writeFileSync(
      file,
      "export function renderComments() {}\nexport const parseFindings = 1;\n",
    );
    expect(repo.deriveSymbols([file], cwd, 15).symbols).toEqual([
      { name: "renderComments", file: "render-comments.mjs", kind: "ts" },
      { name: "parseFindings", file: "render-comments.mjs", kind: "ts" },
    ]);
  });

  it("uses the basename for PHP and the exports for TypeScript, skipping generic and short names", () => {
    const cwd = makeRepo();
    const files = [
      join(cwd, "app", "Services", "Invoice.php"),
      join(cwd, "app", "Services", "index.php"),
      join(cwd, "src", "lib", "commands.ts"),
    ];
    const { symbols, truncated } = repo.deriveSymbols(files, cwd, 15);
    expect(truncated).toBe(false);
    expect(symbols).toEqual([
      { name: "Invoice", file: "app/Services/Invoice.php", kind: "php" },
      { name: "formatDate", file: "src/lib/commands.ts", kind: "ts" },
      { name: "parseDate", file: "src/lib/commands.ts", kind: "ts" },
      { name: "main", file: "src/lib/commands.ts", kind: "ts" },
    ]);
  });

  it("falls back to the basename for a JS/TS file with no named exports", () => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-fallback-"));
    const files = ["Dialog.tsx", "index.ts", "ab.ts", "Named.ts"].map((f) =>
      join(cwd, f),
    );
    writeFileSync(files[0] ?? "", "export * from './x';\n");
    writeFileSync(files[1] ?? "", "const a = 1;\n");
    writeFileSync(files[2] ?? "", "const a = 1;\n");
    writeFileSync(files[3] ?? "", "export const named = 1;\n");
    const filtered = join(cwd, "dateFormat.ts");
    writeFileSync(filtered, "export const fmt = 1;\nexport const index = 2;\n");
    expect(repo.deriveSymbols([...files, filtered], cwd, 15).symbols).toEqual([
      {
        name: "Dialog",
        file: "Dialog.tsx",
        kind: "ts",
        basenameFallback: true,
      },
      { name: "named", file: "Named.ts", kind: "ts" },
      {
        name: "dateFormat",
        file: "dateFormat.ts",
        kind: "ts",
        basenameFallback: true,
      },
    ]);
  });

  it("caps the symbol list and reports truncation", () => {
    const cwd = makeRepo();
    const files = [
      join(cwd, "app", "Services", "Invoice.php"),
      join(cwd, "src", "lib", "commands.ts"),
    ];
    const { symbols, truncated } = repo.deriveSymbols(files, cwd, 2);
    expect(symbols.map((s) => s.name)).toEqual(["Invoice", "formatDate"]);
    expect(truncated).toBe(true);
  });
});

describe("resolveRepo", () => {
  it("resolves root, name, and relative target for a directory inside a git repo", () => {
    const cwd = makeRepo();
    const r = repo.resolveRepo(join(cwd, "app", "Services"));
    expect(r.relTarget).toBe("app/Services");
    expect(r.repoName).toBe(cwd.split("/").pop());
  });

  it("throws for a missing target and for a path outside git", () => {
    expect(() => repo.resolveRepo("/definitely/not/here")).toThrow(
      /does not exist/,
    );
    const plain = mkdtempSync(join(tmpdir(), "investigate-nogit-"));
    expect(() => repo.resolveRepo(plain)).toThrow(
      /not inside a git repository/,
    );
  });
});

describe("probe", () => {
  it("is true for git and false for a missing binary", () => {
    expect(exec.probe("git")).toBe(true);
    expect(exec.probe("definitely-not-a-binary-xyz")).toBe(false);
  });
});
