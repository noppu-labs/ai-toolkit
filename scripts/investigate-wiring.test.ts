import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  makeFakeAstGrepPath,
  makeNoToolsPath,
} from "./fixtures/no-tools-path.ts";

type Hit = {
  filePath: string;
  lineNo: string;
  text: string;
  category?: string;
};
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
  ) => Buckets;
  astGrepScan: (ctx: Ctx) => AstScan;
  wiringFor: (ctx: Ctx, sym: string, ownFile: string) => Buckets | null;
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
const FAKE_AST_GREP_PATH: string = makeFakeAstGrepPath(
  join(import.meta.dirname, "fixtures", "fake-ast-grep.mjs"),
);

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}

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

  it("always returns a known non-test category", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const c = wiring.classifyHit("Foo", text);
        return wiring.CATEGORIES.includes(c) && c !== "test";
      }),
    );
  });
});

describe("bucketHits", () => {
  it("drops internal hits, lets ast hits claim lines, and routes test paths to test", () => {
    const grep = [
      "app/Services/Invoice.php:2:class Invoice {}",
      "app/Providers/AppServiceProvider.php:2:$this->app->singleton(Invoice::class, fn () => new Invoice());",
      "app/Http/InvoiceController.php:3:public function __construct(Invoice $invoice)",
      "tests/InvoiceTest.php:2:$x = new Invoice();",
    ].join("\n");
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
      `app/Http/InvoiceController.php:3:${line}`,
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
    const grep = [
      "src/use.spec.ts:1:import { Invoice } from './Invoice';",
      "src/Invoice.test.tsx:4:render(<Invoice />)",
      "src/page.tsx:2:<Invoice />",
    ].join("\n");
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

describe("duplicateDefinitions", () => {
  it("lists other definitions of the same class name, excluding the own file", () => {
    const ctx = makeRepo();
    expect(
      wiring.duplicateDefinitions(ctx, "Invoice", "app/Services/Invoice.php"),
    ).toEqual(["app/Http/InvoiceController.php:4"]);
  });
});
