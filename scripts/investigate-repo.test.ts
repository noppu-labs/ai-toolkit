import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  makeGitDirRepo,
  makeSpaceRootRepo,
} from "./fixtures/git-dir-target.ts";
import { git } from "./fixtures/investigate-git.ts";
import type { Sym } from "./fixtures/investigate-types.ts";
import { FAKE_MARKER_PATH, UNSET_GIT_ENV } from "./fixtures/marker-tool.ts";
import { makeFakeGitPath } from "./fixtures/no-tools-path.ts";

type RepoModule = {
  TS_EXT_RE: RegExp;
  compareCodeUnits: (a: string, b: string) => number;
  collectFiles: (p: string, env?: NodeJS.ProcessEnv) => string[];
  tsExports: (text: string) => string[];
  deriveSymbols: (
    files: string[],
    repoRoot: string,
    maxSymbols: number,
  ) => { symbols: Sym[]; truncated: boolean; unnamed: string[] };
  resolveRepo: (
    targetArg: string,
    env?: NodeJS.ProcessEnv,
  ) => {
    target: string;
    repoRoot: string;
    repoName: string;
    relTarget: string;
  };
  isOutside: (parent: string, child: string) => boolean;
  isSelfOrAncestor: (dir: string, start: string) => boolean;
};

type ExecModule = {
  probe: (cmd: string, env?: NodeJS.ProcessEnv) => boolean;
  git: (
    args: string[],
    opts?: { cwd?: string },
  ) => { status: number | null; stdout: string };
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
  const lineEnds = fc.constantFrom("\n", "\r\n", "\r", "\u{2028}", "\u{2029}");
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
    unit: fc.constantFrom(
      " ",
      "\t",
      "\n",
      "\r",
      "\u{a0}",
      "\u{feff}",
      "\u{2028}",
      "\u{2029}",
    ),
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

  it("names no symbol after a file whose name cannot be one, and lists the file as unnamed", () => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-unnamed-"));
    const names = [
      "--open-files-in-pager=marker-tool.php",
      "2024_01_01_create_users_table.php",
      "-rf.php",
      "Invoice.php",
      "--flag=value.ts",
      "use-toast.ts",
      "welcome.blade.php",
      "Café.php",
      "user-profile.blade.php",
      "vite.config.ts",
      "my file.php",
      "[id].tsx",
      "a;b-c.php",
    ];
    for (const name of names) writeFileSync(join(cwd, name), "<?php\n");
    const derived = repo.deriveSymbols(
      names.map((name) => join(cwd, name)),
      cwd,
      15,
    );
    expect(derived.symbols).toEqual([
      { name: "Invoice", file: "Invoice.php", kind: "php" },
      {
        name: "use-toast",
        file: "use-toast.ts",
        kind: "ts",
        basenameFallback: true,
      },
      { name: "welcome", file: "welcome.blade.php", kind: "php" },
      { name: "Café", file: "Café.php", kind: "php" },
      { name: "user-profile", file: "user-profile.blade.php", kind: "php" },
      {
        name: "vite.config",
        file: "vite.config.ts",
        kind: "ts",
        basenameFallback: true,
      },
    ]);
    expect(derived.unnamed).toEqual([
      "--open-files-in-pager=marker-tool.php",
      "2024_01_01_create_users_table.php",
      "-rf.php",
      "--flag=value.ts",
      "my file.php",
      "[id].tsx",
      "a;b-c.php",
    ]);
  });

  it("composes a non-ASCII name stored decomposed, and keeps the file as stored", () => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-nfd-"));
    const stored = "Café".normalize("NFD");
    expect(
      repo.deriveSymbols([join(cwd, `${stored}.php`)], cwd, 15).symbols,
    ).toEqual([
      { name: "Café".normalize("NFC"), file: `${stored}.php`, kind: "php" },
    ]);
  });

  it("gives a name stored both composed and decomposed one symbol", () => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-nfd-"));
    const files = ["NFC", "NFD"].map((form) =>
      join(cwd, `${"Café".normalize(form)}.php`),
    );
    expect(repo.deriveSymbols(files, cwd, 15).symbols).toHaveLength(1);
  });

  it("lists a short or generic file name as neither a symbol nor unnamed", () => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-generic-"));
    const derived = repo.deriveSymbols(
      [join(cwd, "index.php"), join(cwd, "Api.php")],
      cwd,
      15,
    );
    expect(derived).toEqual({ symbols: [], truncated: false, unnamed: [] });
  });

  it("derives only names that start with a letter, _ or $, whatever the files are called", () => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-names-"));
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string({ unit: "binary" }),
            fc.stringMatching(/^-{1,2}[a-z-]{1,12}(=[ -~]{0,12})?$/),
            fc.stringMatching(/^[A-Za-z_$][\w$]{0,12}$/),
            fc.stringMatching(/^[a-z]{1,6}([.-][a-z0-9]{1,6}){1,3}$/),
            fc.stringMatching(/^[a-z]{2,6}[=:'"`\\\s][a-z]{1,6}$/),
          ),
          { maxLength: 8 },
        ),
        (names) => {
          const files = names.map((name) => join(cwd, `${name}.php`));
          const { symbols } = repo.deriveSymbols(files, cwd, 15);
          for (const sym of symbols) {
            expect(sym.name).toMatch(/^[\p{L}_$][\p{L}\p{M}\p{N}_$.-]*$/u);
            expect(sym.name.startsWith("-")).toBe(false);
            expect(sym.name).not.toMatch(/[\s\p{Cc}]/u);
            // Independent of the rule's own expression: nothing that could end
            // a pattern, start an option value, or split a path or a line.
            expect(sym.name).not.toMatch(/[\p{C}\p{Z}=:'"`\\/]/u);
          }
        },
      ),
    );
  });

  it("keeps every kebab-case or dotted file name that is long enough", () => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-kebab-"));
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{2,6}([.-][a-z0-9]{1,6}){1,3}$/),
        (name) => {
          const derived = repo.deriveSymbols(
            [join(cwd, `${name}.php`)],
            cwd,
            15,
          );
          expect(derived.symbols.map((s) => s.name)).toEqual([name]);
          expect(derived.unnamed).toEqual([]);
        },
      ),
    );
  });

  it("keeps every identifier file name that is long enough and not generic", () => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-kept-"));
    fc.assert(
      fc.property(
        fc
          .stringMatching(/^[A-Za-z_$][\w$]{3,20}$/)
          .filter(
            (name) =>
              !/^(index|types|schemas|utils|helpers|config|constants)$/i.test(
                name,
              ),
          ),
        (name) => {
          const derived = repo.deriveSymbols(
            [join(cwd, `${name}.php`)],
            cwd,
            15,
          );
          expect(derived.symbols.map((s) => s.name)).toEqual([name]);
          expect(derived.unnamed).toEqual([]);
        },
      ),
    );
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

// Which of the two refusals fires depends on the git version: 2.38 and newer
// refuse the directory themselves, and older ones leave it to the script.
const REFUSED = /not inside a git repository|inside a git directory/;

describe("resolveRepo on a target inside a git directory", () => {
  it.each([".", ".."] as const)(
    "refuses the directory, a file in it, and a nested directory (worktree = %s)",
    (worktree) => {
      const { sub, marker } = makeGitDirRepo({ worktree });
      const env = { PATH: FAKE_MARKER_PATH, FAKE_MARKER_FILE: marker };

      for (const target of [sub, join(sub, "thing.ts"), join(sub, "..x")]) {
        expect(() => repo.resolveRepo(target, env)).toThrow(REFUSED);
      }

      expect(existsSync(marker)).toBe(false);
    },
  );

  it.each([".", ".."] as const)(
    "refuses them itself when git ignores safe.bareRepository (worktree = %s)",
    (worktree) => {
      const { sub, marker } = makeGitDirRepo({ worktree });
      const env = { ...UNSET_GIT_ENV, FAKE_MARKER_FILE: marker };

      for (const target of [
        sub,
        join(sub, "thing.ts"),
        join(sub, "..x"),
        join(sub, "..x", "inner.ts"),
      ]) {
        expect(() => repo.resolveRepo(target, env)).toThrow(
          "target is inside a git directory, not a working tree",
        );
      }

      expect(existsSync(marker)).toBe(false);
    },
  );
});

const INSIDE_GIT_DIR = "target is inside a git directory, not a working tree";

// One entry per character a reader of git's answer could strip by mistake.
const TRAILING_WHITESPACE: [string, string][] = [
  ["a space", "pkg "],
  ["a tab", "pkg\t"],
  ["a carriage return", "pkg\r"],
  ["a newline", "pkg\n"],
  ["a no-break space", "pkg\u00a0"],
];

describe("resolveRepo on a git directory whose name ends in whitespace", () => {
  it.each(TRAILING_WHITESPACE)(
    "refuses one ending in %s, beside a directory with the trimmed name",
    (_label, name) => {
      const { sub, marker } = makeGitDirRepo({ name, hasTrimmedSibling: true });
      const env = { PATH: FAKE_MARKER_PATH, FAKE_MARKER_FILE: marker };

      for (const target of [sub, join(sub, "thing.ts"), join(sub, "..x")]) {
        expect(() => repo.resolveRepo(target, env)).toThrow(REFUSED);
      }

      expect(existsSync(marker)).toBe(false);
    },
  );

  it.each(TRAILING_WHITESPACE)(
    "refuses one ending in %s itself when git ignores safe.bareRepository",
    (_label, name) => {
      for (const worktree of [".", ".."] as const) {
        const { sub, marker } = makeGitDirRepo({
          worktree,
          name,
          hasTrimmedSibling: true,
        });
        const env = { ...UNSET_GIT_ENV, FAKE_MARKER_FILE: marker };

        for (const target of [sub, join(sub, "thing.ts"), join(sub, "..x")]) {
          expect(() => repo.resolveRepo(target, env)).toThrow(INSIDE_GIT_DIR);
        }

        expect(existsSync(marker)).toBe(false);
      }
    },
  );
});

// A current git does not apply safe.bareRepository below a path like this
// one, so here the real git leaves the refusal to the script, as an old git
// does everywhere. A git from 2.38 on that lacks the exemption refuses first.
describe("resolveRepo on a checkout below a .git/modules path", () => {
  it.each([
    ["pkg", false],
    ["pkg ", true],
  ] as const)(
    "refuses the git directory named '%s' with the real git",
    (name, hasTrimmedSibling) => {
      const { sub, marker } = makeGitDirRepo({
        name,
        hasTrimmedSibling,
        under: [".git", "modules", "vendored"],
      });
      const env = { PATH: FAKE_MARKER_PATH, FAKE_MARKER_FILE: marker };

      for (const target of [sub, join(sub, "thing.ts"), join(sub, "..x")]) {
        expect(() => repo.resolveRepo(target, env)).toThrow(REFUSED);
      }

      expect(existsSync(marker)).toBe(false);
    },
  );
});

describe("resolveRepo on an answer from git that is not a path", () => {
  it("refuses with a reason when git prints the option back", () => {
    const cwd = makeRepo();
    const env = {
      PATH: makeFakeGitPath(
        join(import.meta.dirname, "fixtures", "fake-git-echo.mjs"),
        {},
      ),
    };

    expect(() => repo.resolveRepo(join(cwd, "src"), env)).toThrow(
      "git did not name its git directory (git 2.13 or newer is needed)",
    );
  });
});

// True where a path reaches the same file in any letter case, as on the
// default macOS and Windows filesystems.
const IS_CASE_INSENSITIVE_FS: boolean = existsSync(
  mkdtempSync(join(tmpdir(), "investigate-case-")).toUpperCase(),
);

describe("resolveRepo on a target spelled in another letter case", () => {
  // Skipped on a case-sensitive filesystem, where such a path does not exist.
  it("refuses a git directory reached through a different spelling of its name", {
    skip: !IS_CASE_INSENSITIVE_FS,
  }, () => {
    const { cwd, marker } = makeGitDirRepo();
    const env = { ...UNSET_GIT_ENV, FAKE_MARKER_FILE: marker };

    for (const target of ["PKG", "PKG/thing.ts", "Pkg/..X"]) {
      expect(() => repo.resolveRepo(join(cwd, target), env)).toThrow(
        "target is inside a git directory, not a working tree",
      );
    }

    expect(existsSync(marker)).toBe(false);
  });
});

describe("resolveRepo on working trees", () => {
  it.each([
    ["git's own check", { PATH: FAKE_MARKER_PATH }],
    ["a git that ignores safe.bareRepository", UNSET_GIT_ENV],
  ])(
    "resolves the root, a linked worktree, and a worktree of a bare clone, with %s",
    (_label, env) => {
      const cwd = realpathSync(makeRepo());
      git(cwd, "add", ".");
      git(cwd, "commit", "-q", "-m", "base");
      const scratch = realpathSync(
        mkdtempSync(join(tmpdir(), "investigate-worktrees-")),
      );
      const linked = join(scratch, "linked");
      const bare = join(scratch, "bare.git");
      const beside = join(scratch, "beside");
      const within = join(bare, "within");
      git(cwd, "worktree", "add", "-q", "--detach", linked);
      git(scratch, "clone", "-q", "--bare", cwd, bare);
      git(bare, "worktree", "add", "-q", "--detach", beside);
      git(bare, "worktree", "add", "-q", "--detach", within);

      for (const root of [cwd, linked, beside, within]) {
        expect(repo.resolveRepo(root, env).repoRoot).toBe(root);
        expect(repo.resolveRepo(join(root, "src", "lib"), env)).toMatchObject({
          repoRoot: root,
          relTarget: "src/lib",
        });
        expect(
          repo.resolveRepo(join(root, "src", "lib", "commands.ts"), env)
            .repoRoot,
        ).toBe(root);
      }
    },
  );
});

describe("resolveRepo on a working tree whose root name ends in a space", () => {
  it.each([
    ["git's own check", { PATH: FAKE_MARKER_PATH }],
    ["a git that ignores safe.bareRepository", UNSET_GIT_ENV],
  ])("keeps the name as it is, with %s", (_label, env) => {
    const { cwd } = makeSpaceRootRepo();

    expect(repo.resolveRepo(join(cwd, "src"), env)).toMatchObject({
      repoRoot: cwd,
      repoName: "repo ",
      relTarget: "src",
    });
    expect(repo.resolveRepo(cwd, env).repoRoot).toBe(cwd);
  });
});

describe("resolveRepo on a directory whose .git file names a bare clone", () => {
  it("says the target is not inside a repository, since there is no working tree", () => {
    const cwd = realpathSync(makeRepo());
    git(cwd, "add", ".");
    git(cwd, "commit", "-q", "-m", "base");
    const holder = realpathSync(
      mkdtempSync(join(tmpdir(), "investigate-bare-holder-")),
    );
    git(holder, "clone", "-q", "--bare", cwd, join(holder, ".bare"));
    writeFileSync(join(holder, ".git"), "gitdir: ./.bare\n");

    for (const env of [{ PATH: FAKE_MARKER_PATH }, UNSET_GIT_ENV]) {
      expect(() => repo.resolveRepo(holder, env)).toThrow(
        "target is not inside a git repository",
      );
    }
  });
});

describe("isSelfOrAncestor", () => {
  it("is true for the directory itself and for a directory above the start", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "investigate-id-")));
    mkdirSync(join(root, "a", "b"), { recursive: true });

    expect(repo.isSelfOrAncestor(root, root)).toBe(true);
    expect(repo.isSelfOrAncestor(root, join(root, "a"))).toBe(true);
    expect(repo.isSelfOrAncestor(join(root, "a"), join(root, "a", "b"))).toBe(
      true,
    );
  });

  it("is false for a directory below the start and for one beside it", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "investigate-id-")));
    mkdirSync(join(root, "a", "b"), { recursive: true });
    mkdirSync(join(root, "c"));

    expect(repo.isSelfOrAncestor(join(root, "a", "b"), join(root, "a"))).toBe(
      false,
    );
    expect(repo.isSelfOrAncestor(join(root, "c"), join(root, "a", "b"))).toBe(
      false,
    );
  });

  it("finds a directory reached under another name, which a comparison of names misses", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "investigate-id-")));
    mkdirSync(join(root, "stored", "below"), { recursive: true });
    symlinkSync(join(root, "stored"), join(root, "other"));
    const start = join(root, "other", "below");

    expect(repo.isOutside(join(root, "stored"), start)).toBe(true);
    expect(repo.isSelfOrAncestor(join(root, "stored"), start)).toBe(true);
  });
});

describe("isOutside", () => {
  it("is false for the directory itself and for anything below it", () => {
    expect(repo.isOutside("/a/b", "/a/b")).toBe(false);
    expect(repo.isOutside("/a/b", "/a/b/c")).toBe(false);
    expect(repo.isOutside("/a/b", "/a/b/c/d.ts")).toBe(false);
  });

  it("is false for a child whose name starts with two dots", () => {
    expect(repo.isOutside("/a/b", "/a/b/..x")).toBe(false);
    expect(repo.isOutside("/a/b", "/a/b/..x/y")).toBe(false);
    expect(repo.isOutside("/a/b", "/a/b/...")).toBe(false);
  });

  it("is true for the parent, an ancestor, and a sibling", () => {
    expect(repo.isOutside("/a/b", "/a")).toBe(true);
    expect(repo.isOutside("/a/b", "/")).toBe(true);
    expect(repo.isOutside("/a/b", "/a/c")).toBe(true);
    expect(repo.isOutside("/a/b", "/a/bc")).toBe(true);
    expect(repo.isOutside("/a/b", "/a/..x")).toBe(true);
  });

  it("agrees with a segment-by-segment comparison for any two paths", () => {
    const segment = fc.constantFrom("a", "b", "..x", "...", "x..", ".git");
    const segments = fc.array(segment, { maxLength: 4 });

    fc.assert(
      fc.property(segments, segments, (parent, child) => {
        const isBelow: boolean = parent.every((seg, i) => child[i] === seg);

        expect(
          repo.isOutside(`/${parent.join("/")}`, `/${child.join("/")}`),
        ).toBe(!isBelow);
      }),
    );
  });
});

describe("git", () => {
  it("runs git with safe.bareRepository set to explicit", () => {
    const res = exec.git(["config", "--get", "safe.bareRepository"]);
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe("explicit");
  });
});

describe("probe", () => {
  it("is true for git and false for a missing binary", () => {
    expect(exec.probe("git")).toBe(true);
    expect(exec.probe("definitely-not-a-binary-xyz")).toBe(false);
  });
});
