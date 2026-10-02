import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

type Hit = {
  filePath: string;
  lineNo: string;
  text: string;
  category?: string;
};
type Buckets = Record<string, Hit[]>;
type Ctx = { repoRoot: string; relTarget: string; env: NodeJS.ProcessEnv };

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
  astGrepHits: (ctx: Ctx) => Hit[] | null;
  wiringFor: (ctx: Ctx, sym: string) => Buckets | null;
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

const NO_TOOLS_PATH: string = [
  join(process.execPath, ".."),
  spawnSync("which", ["git"], { encoding: "utf8" })
    .stdout.trim()
    .replace(/\/git\n?$/, ""),
].join(":");

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
    const b = wiring.wiringFor(ctx, "Invoice");
    expect(b).not.toBeNull();
    expect(b?.binding?.[0]?.filePath).toBe(
      "app/Providers/AppServiceProvider.php",
    );
    expect(b?.typehint?.[0]?.filePath).toBe("app/Http/InvoiceController.php");
    expect(b?.test?.[0]?.filePath).toBe("tests/InvoiceTest.php");
  });

  it("returns empty buckets when nothing matches and null when git fails", () => {
    const ctx = makeRepo();
    expect(wiring.wiringFor(ctx, "NothingNamedThis")).toEqual({});
    expect(
      wiring.wiringFor({ ...ctx, repoRoot: "/nonexistent-root" }, "Invoice"),
    ).toBeNull();
    const notARepo = mkdtempSync(join(tmpdir(), "investigate-wiring-nogit-"));
    expect(
      wiring.wiringFor({ ...ctx, repoRoot: notARepo }, "Invoice"),
    ).toBeNull();
  });
});

describe("astGrepHits", () => {
  it("returns null when ast-grep is not on PATH", () => {
    expect(wiring.astGrepHits(makeRepo())).toBeNull();
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
