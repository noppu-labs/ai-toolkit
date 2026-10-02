import path from "node:path";
import { majorOf } from "./docs-gate.mjs";
import { CATEGORIES } from "./wiring.mjs";

const MAX_SHOWN_PER_CATEGORY = 8;
const MAX_GRAPH_LIST = 10;
const MAX_GRAPH_PROCESSES = 5;
const MAX_IMPORTED_AS = 4;

export const TOOL_ORDER = [
  "git",
  "gitnexus",
  "codegraph",
  "ast-grep",
  "phpantom_lsp",
  "typescript-language-server",
  "context7",
];

export const WIRING_LABELS = {
  container: "container resolution (resolve/app/make)",
  binding: "provider bindings",
  typehint: "DI type-hints / parameters",
  construction: "direct construction (new)",
  jsx: "JSX usage",
  static: "static / constant references",
  import: "imports",
  test: "test references",
  other: "other references",
};

export const DOCS_SKIPPED = "--no-docs";
export const DOCS_NO_IMPORTS = "no third-party imports";
export const DOCS_NO_FETCH = "no global fetch";
export const DOCS_NO_LOCKFILE = "no lockfile read";
const LOCKFILE_ECOSYSTEM = {
  "composer.lock": "composer",
  "package-lock.json": "npm",
};
const DOC_SOURCES_HEADING = "## Doc sources (context7 version gate)";

// High-volume, low-signal categories: counts + file list only.
const COUNT_ONLY = new Set(["test", "import"]);

export function renderHeader(relTarget, repoName) {
  return [
    `# Structural brief: ${relTarget} (repo: ${repoName})`,
    "",
    "> Deterministic pre-computation (graph + textual reference scan). Trust this over recall.",
    "> The call graph for PHP has NO inheritance edges and NO container-resolution edges —",
    "> graph caller lists are a LOWER BOUND. The wiring scan below recovers textual references.",
    "> Anything not listed here is UNRESOLVED, not absent. Verify line numbers before citing.",
    "",
  ];
}

export function renderTools(tools) {
  const lines = ["## Tools", ""];
  for (const name of TOOL_ORDER) {
    if (tools[name]) lines.push(`- ${name}: ${tools[name]}`);
  }
  lines.push("");
  return lines;
}

export function renderIndex(freshness) {
  if (!freshness.ok) {
    return [
      `Index: UNAVAILABLE — ${freshness.note}. Graph sections omitted; wiring scan still valid.`,
      "",
    ];
  }
  const behind = freshness.divergent
    ? "indexed commit is not in HEAD's history"
    : `${freshness.commitsBehind} commits behind HEAD`;
  const staleFlag = freshness.stale
    ? ` — STALE (${behind}; graph data may be outdated)`
    : " — current";
  return [
    `Index: commit ${freshness.indexed} (branch ${freshness.branch})${staleFlag}`,
    "",
  ];
}

export function renderFiles(files, repoRoot, truncated, maxSymbols, notes) {
  const lines = [`## Files (${files.length})`];
  for (const f of files) {
    const rel = path.relative(repoRoot, f);
    const note = notes?.basenameFiles?.has(rel)
      ? " (no named exports; basename used)"
      : "";
    lines.push(`- ${rel}${note}`);
  }
  if (truncated) {
    lines.push(
      `- … symbol detail capped at ${maxSymbols} classes (--max-symbols to raise)`,
    );
  }
  lines.push("");
  return lines;
}

function dependencyRow(row) {
  const lines = [
    `- **${row.name}** ${row.version}${row.dev ? " (dev)" : ""} — read at \`${row.path}\``,
  ];
  if (row.ambiguous) {
    lines.push(
      `    - ⚠ AMBIGUOUS: ${row.ambiguous.join(" and ")} both declare this namespace — confirm which one owns the class before citing it.`,
    );
  }
  const importedAs = row.importedAs ?? [];
  const shown = importedAs.slice(0, MAX_IMPORTED_AS).join(", ");
  const more =
    importedAs.length > MAX_IMPORTED_AS
      ? `, … ${importedAs.length - MAX_IMPORTED_AS} more`
      : "";
  lines.push(`    - imported as: ${shown}${more}`);
  return lines;
}

function unreadLine(lockfile) {
  return `- UNRESOLVED: no ${lockfile} was read, so this target's ${LOCKFILE_ECOSYSTEM[lockfile]} imports were not checked. Read the manifest and installed source by hand.`;
}

export function renderDependencies(rows, unread) {
  if (rows.length === 0 && unread.length === 0) return [];
  return [
    "## Third-party surface (installed versions, from lockfiles)",
    "",
    "> These are the versions ACTUALLY INSTALLED, not the manifest ranges. Any claim about",
    "> how one of these behaves must cite installed source under the listed path, or a",
    "> context7 lookup at this version — never recall. On disagreement, installed source wins.",
    "",
    ...unread.map(unreadLine),
    ...rows.flatMap(dependencyRow),
    "",
  ];
}

function docPreamble(anonymous) {
  const lines = [DOC_SOURCES_HEADING, ""];
  if (anonymous) {
    lines.push(
      "> CONTEXT7_API_KEY not set — queried anonymously (results may be rate-limited).",
      "",
    );
  }
  lines.push(
    "> Computed, not recalled: `branch` decides which version the docs describe, and the",
    "> context7 MCP tool does NOT display it. Use the id marked USE UNPINNED, or the pinned",
    "> id a PIN to verdict names.",
    "> Where every candidate is STALE, read installed source instead — stale docs produce",
    "> confident wrong claims that arrive wearing a citation.",
    ">",
    "> A ✅ is an instruction, not permission. The expensive half of the job (proving these",
    "> docs describe the version actually installed) is already done, so before you write any",
    "> claim about a ✅ package's API, CALL `query-docs` with that id verbatim. Skipping",
    "> straight to installed source is the right move for ⚠ and ⛔ rows only.",
    "> Fetching is not deferring: on disagreement, installed source still wins.",
    "",
  );
  return lines;
}

function packageLines(entry) {
  const { row } = entry;
  const lines = [
    `- **${row.name}** ${row.version} (installed major: ${majorOf(row.version) ?? "?"})`,
  ];
  if (entry.error) {
    lines.push(
      `    - lookup FAILED (${entry.error}) — treat doc coverage as UNRESOLVED, read installed source`,
    );
    return lines;
  }
  if (entry.noMatch) {
    lines.push("    - no context7 match — read installed source");
    return lines;
  }
  for (const v of entry.verdicts) {
    lines.push(
      `    - ${v.mark} \`${v.id}\` — ${v.label}`,
      `        (${v.meta})`,
    );
  }
  if (entry.noUsable) {
    lines.push(
      "    - ⛔ NO USABLE DOCS for the installed version — hand no id to the agents; read installed source.",
    );
  }
  return lines;
}

function fetchLines(fetchable) {
  if (fetchable.length === 0) {
    return [
      "**FETCH BEFORE CLAIMING** — nothing cleared the version gate. Read installed source for",
      "every package above; do not fetch docs for any of them.",
    ];
  }
  return [
    "**FETCH BEFORE CLAIMING** — these cleared the version gate. Call `query-docs` with the",
    "id verbatim (skip `resolve-library-id`, it is already resolved) for any of them you are",
    "about to describe:",
    ...fetchable.map((f) => `- \`${f.id}\` — ${f.name} ${f.version}`),
  ];
}

export function renderDocSources(gate, skippedReason) {
  if (skippedReason === DOCS_SKIPPED) return [];
  if (skippedReason === DOCS_NO_LOCKFILE) {
    return [
      DOC_SOURCES_HEADING,
      "",
      "- not run: no lockfile was read, so third-party imports are UNRESOLVED (see Third-party surface)",
      "",
    ];
  }
  if (skippedReason === DOCS_NO_IMPORTS) {
    return [
      DOC_SOURCES_HEADING,
      "",
      "- no third-party imports in this target — nothing to gate",
      "",
    ];
  }
  if (gate === null) {
    return [
      "## Doc sources (context7)",
      "",
      "> UNAVAILABLE — this node build has no global fetch.",
      "",
    ];
  }
  return [
    ...docPreamble(gate.anonymous),
    ...gate.perPackage.flatMap(packageLines),
    "",
    ...fetchLines(gate.fetchable),
    "",
  ];
}

export function renderCodegraph(lines) {
  if (!lines) return [];
  return [
    "## Module graph (codegraph — includes inheritance edges the gitnexus PHP graph lacks)",
    "",
    ...lines,
    "",
  ];
}

function collisionLines(sym, dupes) {
  if (dupes.length === 0) return [];
  return [
    `- ⚠ NAME COLLISION: ${sym.name} is also defined at ${dupes.join(", ")} — external references below may belong to that class; verify imports before attributing.`,
  ];
}

function typeLines(typeRows) {
  if (!typeRows) return [];
  return [
    `- resolved types (phpantom, ${typeRows.length} methods):`,
    ...typeRows.map((r) => `    - ${r.detail}`),
  ];
}

function callerLines(tsCallers) {
  if (!tsCallers) return [];
  return [
    `- verified callers (ts-lsp incomingCalls on ${tsCallers.symbol}, ${tsCallers.rows.length} shown):`,
    ...tsCallers.rows.map(
      (r) =>
        `    - ${r.name} (${r.loc}, ${r.sites} call site${r.sites === 1 ? "" : "s"})`,
    ),
  ];
}

function graphIncoming(graph) {
  const calls = graph.incoming?.calls ?? [];
  const imports = graph.incoming?.imports ?? [];
  const lines = [];
  if (calls.length) {
    lines.push(
      `- graph callers (${calls.length}, lower bound):`,
      ...calls
        .slice(0, MAX_GRAPH_LIST)
        .map((c) => `    - ${c.name} (${c.filePath || "?"})`),
    );
  }
  if (imports.length) {
    lines.push(
      `- graph importers (${imports.length}):`,
      ...imports
        .slice(0, MAX_GRAPH_LIST)
        .map((c) => `    - ${c.filePath || c.name}`),
    );
  }
  return lines;
}

function graphLines(sym, graph, freshnessOk) {
  if (!freshnessOk) return [];
  const s = graph?.symbol;
  if (!s) return ["- graph: symbol not found in index"];
  if (s.filePath && !sym.file.endsWith(s.filePath) && s.filePath !== sym.file) {
    return [`- graph: name collision — resolves to ${s.filePath}, skipped`];
  }
  const lines = [
    `- graph: ${s.kind} at ${s.filePath}:${s.startLine}-${s.endLine} (epistemic: ${graph.epistemic || "?"})`,
    ...(graph.boundaries ?? []).map((b) => `- graph boundary: ${b}`),
    ...graphIncoming(graph),
  ];
  const processes = (graph.processes ?? [])
    .map((p) => p.name || p)
    .filter(Boolean);
  if (processes.length) {
    lines.push(
      `- graph processes: ${processes.slice(0, MAX_GRAPH_PROCESSES).join(", ")}`,
    );
  }
  return lines;
}

function moreLine(count) {
  return count > MAX_SHOWN_PER_CATEGORY
    ? [`    - … ${count - MAX_SHOWN_PER_CATEGORY} more`]
    : [];
}

function categoryLines(key, hits) {
  if (COUNT_ONLY.has(key)) {
    const filesOnly = [...new Set(hits.map((h) => h.filePath))];
    return [
      `- ${WIRING_LABELS[key]}: ${hits.length} hits across ${filesOnly.length} files`,
      ...filesOnly.slice(0, MAX_SHOWN_PER_CATEGORY).map((f) => `    - ${f}`),
      ...moreLine(filesOnly.length),
    ];
  }
  return [
    `- ${WIRING_LABELS[key]} (${hits.length}):`,
    ...hits
      .slice(0, MAX_SHOWN_PER_CATEGORY)
      .map((h) => `    - ${h.filePath}:${h.lineNo}  ${h.text}`),
    ...moreLine(hits.length),
  ];
}

function wiringLines(wiring) {
  if (wiring === null) {
    return [
      "- wiring scan FAILED for this symbol (git grep error) — treat external usage as UNRESOLVED",
    ];
  }
  const lines = CATEGORIES.filter((key) => wiring[key]?.length).flatMap((key) =>
    categoryLines(key, wiring[key]),
  );
  if (lines.length === 0) {
    return [
      "- no external references found outside the target (still verify: dynamic/string-based usage is invisible to this scan)",
    ];
  }
  return lines;
}

export function renderSymbol(sym, parts) {
  return [
    `## ${sym.name} (${sym.file})`,
    ...collisionLines(sym, parts.dupes),
    ...typeLines(parts.typeRows),
    ...callerLines(parts.tsCallers),
    ...graphLines(sym, parts.graph, parts.freshnessOk),
    ...wiringLines(parts.wiring),
    "",
  ];
}

export function renderFooter() {
  return [
    "## Unresolved by construction",
    "- Callers reaching these classes through an interface binding or parent class are absent from BOTH passes above.",
    '- String-based/dynamic usage (config-referenced class names, `app("alias")`, events wired by string) is invisible to the wiring scan.',
    "- Graph line numbers may be off by one; verify before citing.",
    "- Third-party behaviour is NOT covered by any structural pass above. A claim about how a listed package behaves is UNRESOLVED until installed source or version-matched docs are read.",
    "- The doc-source gate checks VERSION alignment only. A version-matched doc page can still be wrong or incomplete for your usage; installed source outranks it on any disagreement.",
  ];
}
