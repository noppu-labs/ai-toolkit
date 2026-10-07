import { readFileSync } from "node:fs";
import path from "node:path";
import { compareCodeUnits, TS_EXT_RE } from "./repo.mjs";

const PHP_USE_RE =
  /^\s*use\s+(?:function\s+|const\s+)?\\?([A-Za-z_][A-Za-z0-9_\\]*)/;
const JS_IMPORT_RE = /(?:from\s*|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g;
const NODE_MODULES_PREFIX = "node_modules/";

function readJson(repoRoot, file) {
  try {
    return JSON.parse(readFileSync(path.join(repoRoot, file), "utf8"));
  } catch {
    return null;
  }
}

function safeRead(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Standalone tools shipped as dev deps (e.g. pint) declare their own `App\` psr-4;
// without excluding the root namespaces every first-party `use App\…` would be
// attributed to them.
function rootNamespaces(repoRoot) {
  const composer = readJson(repoRoot, "composer.json");

  return new Set(Object.keys(composer?.autoload?.["psr-4"] ?? {}));
}

function packageNamespaces(pkg) {
  const auto = pkg?.autoload ?? {};

  return [
    ...Object.keys(auto["psr-4"] ?? {}),
    ...Object.keys(auto["psr-0"] ?? {}),
  ];
}

export function composerNamespaceMap(repoRoot) {
  const lock = readJson(repoRoot, "composer.lock");
  if (!lock) return null;

  const rootNs = rootNamespaces(repoRoot);
  const prod = asArray(lock.packages);
  const prodNames = new Set(prod.map((p) => p?.name));
  const rows = [];
  for (const pkg of [...prod, ...asArray(lock["packages-dev"])]) {
    for (const ns of packageNamespaces(pkg)) {
      if (!ns || rootNs.has(ns)) continue;
      rows.push({
        ns,
        name: pkg.name,
        version: pkg.version,
        dev: !prodNames.has(pkg.name),
      });
    }
  }

  // Longest prefix first so Spatie\LaravelData\ beats a bare Spatie\.
  return rows.sort((a, b) => b.ns.length - a.ns.length);
}

export function npmVersions(repoRoot) {
  const lock = readJson(repoRoot, "package-lock.json");
  if (!lock?.packages) return null;

  const map = new Map();
  for (const [key, meta] of Object.entries(lock.packages)) {
    if (!key.startsWith(NODE_MODULES_PREFIX)) continue;
    const name = key.slice(NODE_MODULES_PREFIX.length);
    // Nested installs (a/node_modules/b) are not the top-level resolution.
    if (name.includes(NODE_MODULES_PREFIX)) continue;
    // devOptional: reached only through devDependencies' optional deps, so still dev.
    if (meta?.version) {
      map.set(name, {
        version: meta.version,
        dev: meta.dev === true || meta.devOptional === true,
      });
    }
  }

  return map;
}

export function jsPackageOf(spec) {
  if (!spec || spec.startsWith(".") || spec.startsWith("/")) return null;
  // Path aliases, not packages.
  if (spec.startsWith("@/") || spec.startsWith("~/")) return null;

  const parts = spec.split("/");

  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function note(found, key, row, why) {
  const entry = found.get(key) ?? { ...row, importedAs: new Set() };
  entry.importedAs.add(why);
  found.set(key, entry);
}

function phpUses(text, nsMap, found) {
  for (const line of text.split("\n")) {
    const m = PHP_USE_RE.exec(line);
    if (!m) continue;

    const fqn = m[1];
    const matches = nsMap.filter(
      (r) => fqn.startsWith(r.ns) || `${fqn}\\` === r.ns,
    );
    if (matches.length === 0) continue;

    // Several packages can legitimately claim one prefix. Naming one is a coin
    // flip; name all of them and let the reader resolve it.
    const best = matches.filter((r) => r.ns.length === matches[0].ns.length);
    for (const hit of best) {
      note(
        found,
        hit.name,
        {
          name: hit.name,
          version: hit.version,
          ecosystem: "composer",
          dev: hit.dev,
          path: `vendor/${hit.name}`,
          ambiguous: best.length > 1 ? best.map((r) => r.name) : null,
        },
        fqn,
      );
    }
  }
}

function jsImports(text, npm, found) {
  for (const m of text.matchAll(JS_IMPORT_RE)) {
    const pkg = jsPackageOf(m[1]);
    const installed = pkg ? npm.get(pkg) : undefined;
    if (!installed) continue;

    note(
      found,
      pkg,
      {
        name: pkg,
        version: installed.version,
        ecosystem: "npm",
        dev: installed.dev,
        path: `${NODE_MODULES_PREFIX}${pkg}`,
        ambiguous: null,
      },
      m[1],
    );
  }
}

function scanFile(file, nsMap, npm, found) {
  const text = safeRead(file);
  if (text === null) return;

  if (file.endsWith(".php") && nsMap) phpUses(text, nsMap, found);
  else if (TS_EXT_RE.test(file) && npm) jsImports(text, npm, found);
}

// A target whose ecosystem has no readable lockfile was never checked, which is
// not the same as having no third-party imports.
function unreadLockfiles(files, nsMap, npm) {
  const unread = [];
  if (!nsMap && files.some((f) => f.endsWith(".php"))) {
    unread.push("composer.lock");
  }
  if (!npm && files.some((f) => TS_EXT_RE.test(f))) {
    unread.push("package-lock.json");
  }

  return unread;
}

export function collectDependencies({ files, repoRoot }) {
  const nsMap = composerNamespaceMap(repoRoot);
  const npm = npmVersions(repoRoot);
  const unread = unreadLockfiles(files, nsMap, npm);

  const found = new Map();
  for (const f of files) scanFile(f, nsMap, npm, found);

  const rows = [...found.values()]
    .map((r) => ({
      ...r,
      importedAs: [...r.importedAs].sort(compareCodeUnits),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { rows, unread };
}
