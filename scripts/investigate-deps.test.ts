import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

type DepRow = {
  name: string;
  version: string;
  dev: boolean;
  ecosystem: "composer" | "npm";
  path: string;
  ambiguous: string[] | null;
  importedAs: string[];
};
type DepsModule = {
  composerNamespaceMap: (repoRoot: string) => Array<{
    ns: string;
    name: string;
    version: string;
    dev: boolean;
  }> | null;
  npmVersions: (repoRoot: string) => Map<string, string> | null;
  jsPackageOf: (spec: string) => string | null;
  collectDependencies: (ctx: { files: string[]; repoRoot: string }) => DepRow[];
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
const deps: DepsModule = (await import(
  pathToFileURL(join(libDir, "deps.mjs")).href
)) as DepsModule;

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "investigate-deps-"));
  mkdirSync(join(root, "app"));
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "composer.json"),
    JSON.stringify({ autoload: { "psr-4": { "App\\": "app/" } } }),
  );
  writeFileSync(
    join(root, "composer.lock"),
    JSON.stringify({
      packages: [
        {
          name: "spatie/laravel-data",
          version: "4.11.0",
          autoload: { "psr-4": { "Spatie\\LaravelData\\": "src" } },
        },
        {
          name: "spatie/other",
          version: "1.0.0",
          autoload: { "psr-4": { "Spatie\\": "src" } },
        },
        {
          name: "acme/a",
          version: "1.0.0",
          autoload: { "psr-4": { "Shared\\": "src" } },
        },
        {
          name: "acme/b",
          version: "2.0.0",
          autoload: { "psr-4": { "Shared\\": "src" } },
        },
      ],
      "packages-dev": [
        {
          name: "laravel/pint",
          version: "1.2.3",
          autoload: { "psr-4": { "App\\": "app/", "Pint\\": "src" } },
        },
      ],
    }),
  );
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({
      packages: {
        "": { name: "root" },
        "node_modules/react": { version: "19.2.7" },
        "node_modules/@inertiajs/react": { version: "3.3.1" },
        "node_modules/a/node_modules/react": { version: "17.0.0" },
      },
    }),
  );
  writeFileSync(
    join(root, "app", "Thing.php"),
    "<?php\nuse Spatie\\LaravelData\\Data;\nuse Shared\\Util;\nuse Pint\\Rule;\nuse App\\Models\\User;\n",
  );
  writeFileSync(
    join(root, "src", "page.tsx"),
    "import { usePage } from '@inertiajs/react';\nimport React from \"react\";\nimport x from '@/lib/x';\nimport y from './y';\nconst z = require('react');\n",
  );
  return root;
}

describe("composerNamespaceMap", () => {
  it("excludes the root psr-4 namespace and sorts longest prefix first", () => {
    const rows = deps.composerNamespaceMap(makeRoot());
    expect(rows?.[0]?.ns).toBe("Spatie\\LaravelData\\");
    expect(rows?.some((r) => r.ns === "App\\")).toBe(false);
    expect(rows?.find((r) => r.name === "laravel/pint")).toMatchObject({
      dev: true,
    });
  });

  it("is null without a lockfile", () => {
    expect(
      deps.composerNamespaceMap(mkdtempSync(join(tmpdir(), "x-"))),
    ).toBeNull();
  });

  it("is null for a malformed lockfile", () => {
    const root = mkdtempSync(join(tmpdir(), "x-"));
    writeFileSync(join(root, "composer.lock"), "{not json");
    expect(deps.composerNamespaceMap(root)).toBeNull();
  });
});

describe("npmVersions", () => {
  it("keeps top-level packages only", () => {
    const m = deps.npmVersions(makeRoot());
    expect(m?.get("react")).toBe("19.2.7");
    expect(m?.get("@inertiajs/react")).toBe("3.3.1");
    expect(m?.size).toBe(2);
  });
});

describe("jsPackageOf", () => {
  it.each([
    ["react", "react"],
    ["react/jsx-runtime", "react"],
    ["@inertiajs/react", "@inertiajs/react"],
    ["@inertiajs/react/server", "@inertiajs/react"],
    ["./local", null],
    ["/abs", null],
    ["@/alias", null],
    ["~/alias", null],
    ["", null],
  ])("maps %j to %j", (spec, expected) => {
    expect(deps.jsPackageOf(spec)).toBe(expected);
  });

  it("never returns a relative or alias specifier", () => {
    fc.assert(
      fc.property(fc.string(), (spec) => {
        const r = deps.jsPackageOf(spec);
        return (
          r === null ||
          (!r.startsWith(".") && !r.startsWith("/") && !r.startsWith("@/"))
        );
      }),
    );
  });
});

describe("collectDependencies", () => {
  it("attributes imports to installed packages, flags ambiguous namespaces, ignores root and alias imports", () => {
    const root = makeRoot();
    const rows = deps.collectDependencies({
      files: [join(root, "app", "Thing.php"), join(root, "src", "page.tsx")],
      repoRoot: root,
    });
    expect(rows.map((r) => r.name)).toEqual([
      "@inertiajs/react",
      "acme/a",
      "acme/b",
      "laravel/pint",
      "react",
      "spatie/laravel-data",
    ]);
    expect(rows.find((r) => r.name === "acme/a")?.ambiguous).toEqual([
      "acme/a",
      "acme/b",
    ]);
    expect(rows.find((r) => r.name === "spatie/laravel-data")).toMatchObject({
      version: "4.11.0",
      path: "vendor/spatie/laravel-data",
      importedAs: ["Spatie\\LaravelData\\Data"],
    });
    expect(rows.find((r) => r.name === "react")).toMatchObject({
      version: "19.2.7",
      importedAs: ["react"],
    });
  });

  it("returns an empty array when no lockfile exists", () => {
    const root = mkdtempSync(join(tmpdir(), "x-"));
    expect(deps.collectDependencies({ files: [], repoRoot: root })).toEqual([]);
  });

  it("returns an empty array for malformed lockfiles and skips unreadable files", () => {
    const root = mkdtempSync(join(tmpdir(), "x-"));
    writeFileSync(join(root, "composer.lock"), "{nope");
    writeFileSync(join(root, "package-lock.json"), "[[");
    expect(
      deps.collectDependencies({
        files: [join(root, "missing.php")],
        repoRoot: root,
      }),
    ).toEqual([]);
  });
});
