import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { git } from "./fixtures/investigate-git.ts";
import type { Hit } from "./fixtures/investigate-types.ts";
import {
  FAKE_MARKER_PATH,
  MARKER_OPTION_NAME,
} from "./fixtures/marker-tool.ts";
import { makeFakeToolPath, makeNoToolsPath } from "./fixtures/no-tools-path.ts";

type Buckets = Record<string, Hit[]>;
type Ctx = {
  repoRoot: string;
  relTarget: string;
  files: string[];
  env: NodeJS.ProcessEnv;
};
type AstScan = {
  state: "absent" | "not-needed" | "no-dirs" | "failed" | "ran";
  hits: Hit[] | null;
  error?: string;
};

type WiringModule = {
  CATEGORIES: string[];
  parseGrepLine: (line: string) => Hit | null;
  classifyHit: (sym: string, text: string) => string;
  bucketHits: (
    sym: string,
    relTarget: string,
    grepStdout: string,
    astHits: Hit[] | null,
    fromFileName?: boolean,
  ) => Buckets;
  astGrepScan: (ctx: Ctx) => AstScan;
  wiringFor: (
    ctx: Ctx,
    sym: string,
    ownFile: string,
    fromFileName?: boolean,
  ) => Buckets | null;
  duplicateDefinitions: (ctx: Ctx, sym: string, ownFile: string) => string[];
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
const wiring: WiringModule = (await import(
  pathToFileURL(join(libDir, "wiring.mjs")).href
)) as WiringModule;

const NO_TOOLS_PATH: string = makeNoToolsPath();
const FAKE_AST_GREP_PATH: string = makeFakeToolPath(
  "ast-grep",
  join(import.meta.dirname, "fixtures", "fake-ast-grep.mjs"),
);

function makeRepo(): Ctx {
  const cwd = mkdtempSync(join(tmpdir(), "investigate-wiring-"));
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "t@example.com");
  git(cwd, "config", "user.name", "t");
  mkdirSync(join(cwd, "app", "Services"), { recursive: true });
  mkdirSync(join(cwd, "app", "Providers"), { recursive: true });
  mkdirSync(join(cwd, "app", "Http"), { recursive: true });
  mkdirSync(join(cwd, "tests"), { recursive: true });
  writeFileSync(
    join(cwd, "app", "Services", "Invoice.php"),
    "<?php\nclass Invoice {}\n",
  );
  writeFileSync(
    join(cwd, "app", "Providers", "AppServiceProvider.php"),
    "<?php\n$this->app->singleton(Invoice::class, fn () => new Invoice());\n",
  );
  writeFileSync(
    join(cwd, "app", "Http", "InvoiceController.php"),
    "<?php\nuse App\\Services\\Invoice;\nclass InvoiceController { public function __construct(Invoice $invoice) {} }\nclass Invoice {}\n",
  );
  writeFileSync(
    join(cwd, "tests", "InvoiceTest.php"),
    "<?php\n$x = new Invoice();\n",
  );
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "base");
  return {
    repoRoot: cwd,
    relTarget: "app/Services",
    files: [join(cwd, "app", "Services", "Invoice.php")],
    env: { PATH: NO_TOOLS_PATH },
  };
}

describe("parseGrepLine", () => {
  it("splits path, line, and text; rejects other shapes", () => {
    expect(wiring.parseGrepLine("app/X.php:12:  new Foo()")).toEqual({
      filePath: "app/X.php",
      lineNo: "12",
      text: "new Foo()",
    });
    expect(wiring.parseGrepLine("")).toBeNull();
    expect(wiring.parseGrepLine("no colon here")).toBeNull();
  });

  it("truncates text to 160 characters", () => {
    const hit = wiring.parseGrepLine(`a.php:1:${"x".repeat(500)}`);
    expect(hit?.text.length).toBe(160);
  });
});

describe("classifyHit", () => {
  it.each([
    ["import Foo from './x'", "import"],
    ["} from './Foo'", "import"],
    ["<Foo prop={1} />", "jsx"],
    ["$this->app->bind(Foo::class, Bar::class)", "binding"],
    ["$this->app->bind(Contract::class, Foo::class)", "binding"],
    ["$this->app->singleton(Foo::class, fn () => new Foo())", "binding"],
    ["Foo.bind(this)", "other"],
    ["Foo::instance()", "static"],
    ["resolve(Foo::class)", "container"],
    ["app(\\App\\Foo::class)", "container"],
    ["$x = new Foo($y)", "construction"],
    ["public function __construct(Foo $foo)", "typehint"],
    ["use App\\Services\\Foo;", "import"],
    ["Foo::make()", "static"],
    ["// Foo mentioned", "other"],
  ])("classifies %j as %s", (text, expected) => {
    expect(wiring.classifyHit("Foo", text)).toBe(expected);
  });

  it.each([
    ["public function __construct(Élan $x) {}", "typehint"],
    ["Élan::make()", "static"],
    ["$x = new Élan();", "construction"],
  ])(
    "classifies %j as %s for a name that starts with a non-ASCII letter",
    (text, expected) => {
      expect(wiring.classifyHit("Élan", text)).toBe(expected);
    },
  );

  it("classifies a 200 KB line with a container call in linear time", () => {
    const line = `$this->app->bind(${"a".repeat(200_000)}`;
    const started = Date.now();
    expect(wiring.classifyHit("Foo", line)).toBe("other");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("always returns a known non-test category", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const c = wiring.classifyHit("Foo", text);

        expect(wiring.CATEGORIES).toContain(c);
        expect(c).not.toBe("test");
      }),
    );
  });
});

// `git grep -z` output for lines written as path:line:text.
function grepOutput(...lines: string[]): string {
  return lines
    .map((line) => {
      const [file, lineNo, ...text] = line.split(":");
      return `${file}\0${lineNo}\0${text.join(":")}\n`;
    })
    .join("");
}

describe("bucketHits", () => {
  it("drops internal hits, lets ast hits claim lines, and routes test paths to test", () => {
    const grep = grepOutput(
      "app/Services/Invoice.php:2:class Invoice {}",
      "app/Providers/AppServiceProvider.php:2:$this->app->singleton(Invoice::class, fn () => new Invoice());",
      "app/Http/InvoiceController.php:3:public function __construct(Invoice $invoice)",
      "tests/InvoiceTest.php:2:$x = new Invoice();",
    );
    const ast: Hit[] = [
      {
        category: "binding",
        filePath: "app/Providers/AppServiceProvider.php",
        lineNo: "2",
        text: "$this->app->singleton(Invoice::class, …)",
      },
    ];
    const b = wiring.bucketHits("Invoice", "app/Services", grep, ast);
    expect(b.binding).toHaveLength(1);
    expect(b.binding?.[0]?.text).toContain("…");
    expect(b.typehint).toHaveLength(1);
    expect(b.test).toHaveLength(1);
    expect(b.construction).toBeUndefined();
  });

  it("lets an ast hit take a line the text classifier would file elsewhere", () => {
    const grep = grepOutput(
      "app/Jobs/Run.php:3:$x = new Invoice(); // Invoice::class",
    );
    const ast: Hit[] = [
      {
        category: "container",
        filePath: "app/Jobs/Run.php",
        lineNo: "3",
        text: "resolve(Invoice::class)",
      },
    ];
    expect(wiring.bucketHits("Invoice", "app/Services", grep, null)).toEqual({
      construction: [
        {
          filePath: "app/Jobs/Run.php",
          lineNo: "3",
          text: "$x = new Invoice(); // Invoice::class",
        },
      ],
    });
    const claimed = wiring.bucketHits("Invoice", "app/Services", grep, ast);
    expect(claimed.construction).toBeUndefined();
    expect(claimed.container).toHaveLength(1);
  });

  it("classifies on the full line and truncates only the stored text", () => {
    const params = Array.from(
      { length: 8 },
      (_, i) => `LongDependencyName${i} $dep${i}`,
    ).join(", ");
    const line = `public function __construct(${params}, Invoice $invoice) {}`;
    expect(line.length).toBeGreaterThan(200);
    const b = wiring.bucketHits(
      "Invoice",
      "app/Services",
      grepOutput(`app/Http/InvoiceController.php:3:${line}`),
      null,
    );
    expect(b.typehint).toHaveLength(1);
    expect(b.typehint?.[0]?.text.length).toBe(160);
    const claimed = wiring.bucketHits("Invoice", "app/Services", "", [
      {
        category: "container",
        filePath: "app/Jobs/Run.php",
        lineNo: "5",
        text: `$x = foo(${"a".repeat(180)}, resolve(Invoice::class));`,
      },
    ]);
    expect(claimed.container).toHaveLength(1);
    expect(claimed.container?.[0]?.text.length).toBe(160);
  });

  it("routes co-located *.test.* and *.spec.* files to test references", () => {
    const grep = grepOutput(
      "src/use.spec.ts:1:import { Invoice } from './Invoice';",
      "src/Invoice.test.tsx:4:render(<Invoice />)",
      "src/page.tsx:2:<Invoice />",
    );
    const b = wiring.bucketHits("Invoice", "lib", grep, null);
    expect(b.test?.map((h) => h.filePath)).toEqual([
      "src/use.spec.ts",
      "src/Invoice.test.tsx",
    ]);
    expect(b.jsx?.map((h) => h.filePath)).toEqual(["src/page.tsx"]);
    expect(b.import).toBeUndefined();
  });

  it("claims an ast hit only when the symbol is word-bounded before ::class", () => {
    const hit = (text: string): Hit => ({
      category: "container",
      filePath: "app/Jobs/Run.php",
      lineNo: "5",
      text,
    });
    expect(
      wiring.bucketHits("Invoice", "app/Services", "", [
        hit("$y = resolve(BarInvoice::class);"),
      ]),
    ).toEqual({});
    expect(
      wiring.bucketHits("Invoice", "app/Services", "", [
        hit("resolve(\\App\\Invoice::class)"),
      ]).container,
    ).toHaveLength(1);
  });
});

// The text of every hit bucketHits keeps, given one grep line per text.
function keptTexts(
  sym: string,
  fromFileName: boolean,
  texts: string[],
): string[] {
  const grep = grepOutput(
    ...texts.map((text, i) => `app/use.php:${i + 1}:${text}`),
  );

  return Object.values(wiring.bucketHits(sym, "lib", grep, null, fromFileName))
    .flat()
    .map((h) => h.text);
}

// `file:line` of every hit bucketHits keeps for `Foo`, sorted.
function keptRecords(grep: string): string[] {
  return Object.values(wiring.bucketHits("Foo", "lib", grep, null))
    .flat()
    .map((h) => `${h.filePath}:${h.lineNo}`)
    .sort();
}

describe("bucketHits on git grep -z records", () => {
  const record = (file: string, lineNo: string, text: string): string =>
    `${file}\0${lineNo}\0${text}\n`;
  const noLineBreak = fc
    .string({ unit: "binary" })
    .map((s) => s.replaceAll("\n", ""));

  it("reads every whole record, whatever its path and text hold", () => {
    const path = fc
      .string({ unit: "binary" })
      .map((s) => `app/${s.replaceAll("\0", "")}`);
    const lineNo = fc.stringMatching(/^\d{1,6}$/);
    const text = fc
      .tuple(noLineBreak, noLineBreak)
      .map(([before, after]) => `${before} Foo ${after}`);
    fc.assert(
      fc.property(
        fc.array(fc.tuple(path, lineNo, text), { maxLength: 8 }),
        (records) => {
          const grep = records.map(([f, n, t]) => record(f, n, t)).join("");
          const kept = Object.values(
            wiring.bucketHits("Foo", "lib", grep, null),
          ).flat();

          expect(
            kept.map((h) => [h.filePath, h.lineNo, h.text].join("\0")).sort(),
          ).toEqual(
            records
              .map(([f, n, t]) => [f, n, t.trim().slice(0, 160)].join("\0"))
              .sort(),
          );
        },
      ),
    );
  });

  it("keeps the records before a cut-off tail and nothing of the tail", () => {
    const whole = record("app/a.php", "1", "new Foo();");
    const cuts = [
      "app/b.ph",
      "app/b.php\0",
      "app/b.php\x001",
      "app/b.php\x0012\0",
      "app/b.php\x0012\0new Foo();",
    ];
    for (const tail of cuts) {
      expect(keptRecords(whole + tail)).toEqual(["app/a.php:1"]);
    }
  });

  it("stops at a record whose line number is not a number", () => {
    const grep = [
      record("app/a.php", "1", "new Foo();"),
      record("app/b.php", "x", "new Foo();"),
      record("app/c.php", "3", "new Foo();"),
    ].join("");
    expect(keptRecords(grep)).toEqual(["app/a.php:1"]);
    expect(keptRecords(record("app/b.php", "", "new Foo();"))).toEqual([]);
  });

  // Each start position used to rescan to the end of the input, so the time
  // grew with the square of its length: many seconds at this size.
  it.each([
    ["no NUL and no line break", "a".repeat(200_000)],
    [
      "a last record cut off after its line number",
      `p\x001\0${"a".repeat(200_000)}`,
    ],
  ])("reads input with %s in linear time", (_, grep) => {
    const started = Date.now();
    expect(keptRecords(grep)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("bucketHits on names git grep -w cannot bound", () => {
  it("drops a longer name that starts with a file-name symbol, and keeps the name itself", () => {
    const kept = [
      'return view("components.user-profile");',
      "<x-user-profile />",
      "<x-user-profile-card /> <x-user-profile />",
    ];
    const dropped = ["<x-user-profile-card />", 'view("user-profile-card");'];
    expect(keptTexts("user-profile", true, [...kept, ...dropped])).toEqual(
      kept,
    );
    expect(
      keptTexts("button", true, ["<x-button />", "<x-button-group />"]),
    ).toEqual(["<x-button />"]);
    expect(keptTexts("café", true, ["new café();", "new caféé();"])).toEqual([
      "new café();",
    ]);
  });

  it("still lists what a dot or a dash before the name cannot tell apart", () => {
    expect(
      keptTexts("vite.config", true, [
        'import config from "./vite.config";',
        'load("./vite.config.local");',
      ]),
    ).toHaveLength(2);
    expect(
      keptTexts("user-profile", true, ['view("admin-user-profile");']),
    ).toHaveLength(1);
    expect(
      keptTexts("use-toast", true, ['import { toast } from "./use-toast";']),
    ).toHaveLength(1);
  });

  it("keeps an exported name followed by a dash, and drops one that runs on", () => {
    expect(
      keptTexts("retries", false, [
        "n = retries--;",
        "n = retriesé;",
        "n = $retries;",
      ]),
    ).toEqual(["n = retries--;"]);
    expect(keptTexts("MAX_ROWS", false, ["const last = MAX_ROWS-1;"])).toEqual([
      "const last = MAX_ROWS-1;",
    ]);
  });
});

describe("wiringFor", () => {
  it("buckets external references from git grep without any optional tool", () => {
    const ctx = makeRepo();
    const b = wiring.wiringFor(ctx, "Invoice", "app/Services/Invoice.php");
    expect(b).not.toBeNull();
    expect(b?.binding?.[0]?.filePath).toBe(
      "app/Providers/AppServiceProvider.php",
    );
    expect(b?.typehint?.[0]?.filePath).toBe("app/Http/InvoiceController.php");
    expect(b?.test?.[0]?.filePath).toBe("tests/InvoiceTest.php");
  });

  it("returns empty buckets when nothing matches and null when git fails", () => {
    const ctx = makeRepo();
    const own = "app/Services/Invoice.php";
    expect(wiring.wiringFor(ctx, "NothingNamedThis", own)).toEqual({});
    expect(
      wiring.wiringFor(
        { ...ctx, repoRoot: "/nonexistent-root" },
        "Invoice",
        own,
      ),
    ).toBeNull();
    const notARepo = mkdtempSync(join(tmpdir(), "investigate-wiring-nogit-"));
    expect(
      wiring.wiringFor({ ...ctx, repoRoot: notARepo }, "Invoice", own),
    ).toBeNull();
  });

  it("treats only the defining file as internal when the target is the repo root", () => {
    const ctx = { ...makeRepo(), relTarget: "." };
    const b = wiring.wiringFor(ctx, "Invoice", "app/Services/Invoice.php");
    const listed = Object.values(b ?? {})
      .flat()
      .map((h) => h.filePath);
    expect(listed).not.toContain("app/Services/Invoice.php");
    expect(listed).toContain("app/Providers/AppServiceProvider.php");
  });
});

// What git needs before a name read as an option does anything: the four paths
// the scan excludes, and a tracked source file holding the first glob's text,
// which git takes as the pattern once the name is gone.
function makeOptionRepo(): { ctx: Ctx; marker: string } {
  const cwd = mkdtempSync(join(tmpdir(), "investigate-wiring-opt-"));
  git(cwd, "init", "-q", "-b", "main");
  for (const dir of ["doc", "storage", "dist", "build", "src"]) {
    mkdirSync(join(cwd, dir));
    writeFileSync(join(cwd, dir, "keep.txt"), "x\n");
  }
  writeFileSync(join(cwd, "src", "globs.ts"), 'const glob = "*.php";\n');
  writeFileSync(join(cwd, "src", "store.ts"), "const a = store$;\nlet store\n");
  writeFileSync(
    join(cwd, "src", "shop.mjs"),
    "export class $Store {}\nexport class Cart {}\n",
  );
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "base");
  const marker = join(cwd, "marker.txt");
  return {
    marker,
    ctx: {
      repoRoot: cwd,
      relTarget: "app",
      files: [],
      env: { PATH: FAKE_MARKER_PATH, FAKE_MARKER_FILE: marker },
    },
  };
}

describe("wiringFor on hostile names", () => {
  it("searches for a name that looks like a git option instead of obeying it", () => {
    const { ctx, marker } = makeOptionRepo();
    expect(wiring.wiringFor(ctx, MARKER_OPTION_NAME, "app/own.php")).toEqual(
      {},
    );
    expect(existsSync(marker)).toBe(false);
  });

  it("matches the name as fixed text, not as a pattern", () => {
    const { ctx } = makeOptionRepo();
    const hits = (sym: string): string[] =>
      Object.values(wiring.wiringFor(ctx, sym, "app/own.php") ?? {})
        .flat()
        .map((h) => `${h.filePath}:${h.lineNo}`);
    expect(hits("store$")).toEqual(["src/store.ts:1"]);
    expect(hits("st.re")).toEqual([]);
  });
});

describe("duplicateDefinitions on hostile names", () => {
  it("finds a name holding $ and does not read a name as a pattern", () => {
    const { ctx } = makeOptionRepo();
    expect(wiring.duplicateDefinitions(ctx, "$Store", "app/own.php")).toEqual([
      "src/shop.mjs:1",
    ]);
    expect(wiring.duplicateDefinitions(ctx, ".*", "app/own.php")).toEqual([]);
    expect(wiring.duplicateDefinitions(ctx, "C.rt", "app/own.php")).toEqual([]);
  });

  it("never runs a command named by a name that looks like a git option", () => {
    const { ctx, marker } = makeOptionRepo();
    expect(
      wiring.duplicateDefinitions(ctx, MARKER_OPTION_NAME, "app/own.php"),
    ).toEqual([]);
    expect(existsSync(marker)).toBe(false);
  });
});

function makeModuleRepo(): Ctx {
  const cwd = mkdtempSync(join(tmpdir(), "investigate-wiring-mod-"));
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "t@example.com");
  git(cwd, "config", "user.name", "t");
  mkdirSync(join(cwd, "lib"));
  mkdirSync(join(cwd, "bin"));
  writeFileSync(
    join(cwd, "lib", "format.mjs"),
    "export function formatDate(d) { return d; }\nexport class Store {}\n",
  );
  writeFileSync(
    join(cwd, "bin", "run.mjs"),
    'import { formatDate } from "../lib/format.mjs";\nformatDate(1);\n',
  );
  writeFileSync(join(cwd, "bin", "legacy.cjs"), "formatDate(2);\n");
  writeFileSync(join(cwd, "bin", "typed.mts"), "formatDate(3);\n");
  writeFileSync(
    join(cwd, "bin", "typed.cts"),
    "formatDate(4);\nexport class Store {}\n",
  );
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "base");
  return {
    repoRoot: cwd,
    relTarget: "lib",
    files: [join(cwd, "lib", "format.mjs")],
    env: { PATH: NO_TOOLS_PATH },
  };
}

describe("wiringFor on module variants", () => {
  it("buckets callers in .mjs, .cjs, .mts, and .cts files", () => {
    const b = wiring.wiringFor(
      makeModuleRepo(),
      "formatDate",
      "lib/format.mjs",
    );
    expect(b?.import?.map((h) => h.filePath)).toEqual(["bin/run.mjs"]);
    expect(b?.other?.map((h) => `${h.filePath}:${h.lineNo}`).sort()).toEqual([
      "bin/legacy.cjs:1",
      "bin/run.mjs:2",
      "bin/typed.cts:1",
      "bin/typed.mts:1",
    ]);
  });

  it("finds duplicate definitions in module-variant files", () => {
    expect(
      wiring.duplicateDefinitions(makeModuleRepo(), "Store", "lib/format.mjs"),
    ).toEqual(["bin/typed.cts:2"]);
  });
});

describe("astGrepScan", () => {
  it("is absent when ast-grep is not on PATH", () => {
    expect(wiring.astGrepScan(makeRepo())).toEqual({
      state: "absent",
      hits: null,
    });
  });

  it("is not needed when the target has no PHP files", () => {
    const ctx = { ...makeModuleRepo(), env: { PATH: FAKE_AST_GREP_PATH } };
    expect(wiring.astGrepScan(ctx)).toEqual({
      state: "not-needed",
      hits: null,
    });
  });

  it("collects hits per pattern and lets them claim the wiring line", () => {
    const ctx = { ...makeRepo(), env: { PATH: FAKE_AST_GREP_PATH } };
    const scan = wiring.astGrepScan(ctx);
    expect(scan.state).toBe("ran");
    expect(scan.hits).toEqual([
      {
        category: "container",
        filePath: "app/Jobs/Run.php",
        lineNo: "3",
        text: "$x = resolve(Invoice::class);",
      },
    ]);
    const b = wiring.wiringFor(ctx, "Invoice", "app/Services/Invoice.php");
    expect(b?.container?.map((h) => h.filePath)).toEqual(["app/Jobs/Run.php"]);
  });

  it("reports FAILED when every pattern errors", () => {
    const ctx = {
      ...makeRepo(),
      env: { PATH: FAKE_AST_GREP_PATH, FAKE_AST_GREP_FAIL: "1" },
    };
    expect(wiring.astGrepScan(ctx)).toEqual({
      state: "failed",
      hits: null,
      error: "ERROR: fake pattern failure",
    });
  });
});

// git quotes a path holding a byte outside ASCII unless it is told not to, so
// the quoted form never equals the relative path the brief compares it with.
function makeOddPathRepo(): Ctx {
  const cwd = mkdtempSync(join(tmpdir(), "investigate-wiring-paths-"));
  git(cwd, "init", "-q", "-b", "main");
  mkdirSync(join(cwd, "app", "Modèles"), { recursive: true });
  writeFileSync(
    join(cwd, "app", "Modèles", "InvoiceModel.php"),
    "<?php\nclass InvoiceModel {}\n",
  );
  writeFileSync(join(cwd, "app", "use.php"), "<?php\nnew InvoiceModel();\n");
  writeFileSync(join(cwd, "app", "a:b.php"), "<?php\nnew InvoiceModel();\n");
  writeFileSync(
    join(cwd, "app", "new\nline.php"),
    "<?php\nnew InvoiceModel();\n",
  );
  writeFileSync(join(cwd, "app", "bin.php"), "InvoiceModel\0binary\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "base");
  return {
    repoRoot: cwd,
    relTarget: "app/Modèles",
    files: [join(cwd, "app", "Modèles", "InvoiceModel.php")],
    env: { PATH: NO_TOOLS_PATH },
  };
}

describe("git grep output read by path", () => {
  const own = "app/Modèles/InvoiceModel.php";

  it("knows a non-ASCII path as the symbol's own file", () => {
    const ctx = makeOddPathRepo();
    expect(wiring.duplicateDefinitions(ctx, "InvoiceModel", own)).toEqual([]);
    const listed = Object.values(
      wiring.wiringFor(ctx, "InvoiceModel", own) ?? {},
    )
      .flat()
      .map((h) => h.filePath);
    expect(listed).not.toContain(own);
  });

  it("reads a path holding a colon or a newline whole, and skips binary files", () => {
    const listed = Object.values(
      wiring.wiringFor(makeOddPathRepo(), "InvoiceModel", own) ?? {},
    )
      .flat()
      .map((h) => `${h.filePath}:${h.lineNo}`)
      .sort();
    expect(listed).toEqual([
      "app/a:b.php:2",
      "app/new\nline.php:2",
      "app/use.php:2",
    ]);
  });
});

describe("duplicateDefinitions", () => {
  it("lists other definitions of the same class name, excluding the own file", () => {
    const ctx = makeRepo();
    expect(
      wiring.duplicateDefinitions(ctx, "Invoice", "app/Services/Invoice.php"),
    ).toEqual(["app/Http/InvoiceController.php:4"]);
  });

  it.each(["color.ui", "color.grep"])(
    "still finds them when the user's git config sets %s=always",
    (key) => {
      const ctx = makeRepo();
      const env = {
        ...ctx.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: key,
        GIT_CONFIG_VALUE_0: "always",
      };
      expect(
        wiring.duplicateDefinitions(
          { ...ctx, env },
          "Invoice",
          "app/Services/Invoice.php",
        ),
      ).toEqual(["app/Http/InvoiceController.php:4"]);
    },
  );
});
