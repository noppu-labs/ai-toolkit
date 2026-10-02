#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defaultCacheDir, TtlCache } from "./lib/cache.mjs";
import { collectDependencies } from "./lib/deps.mjs";
import { docSources } from "./lib/docs-gate.mjs";
import { probe } from "./lib/exec.mjs";
import { indexFreshness } from "./lib/freshness.mjs";
import { codegraphOverview, graphContext } from "./lib/graph.mjs";
import { phpantomTypes } from "./lib/phpantom.mjs";
import * as render from "./lib/render.mjs";
import {
  collectFiles,
  deriveSymbols,
  resolveRepo,
  TS_EXT_RE,
} from "./lib/repo.mjs";
import { tsLspCallers } from "./lib/ts-lsp.mjs";
import { astGrepHits, duplicateDefinitions, wiringFor } from "./lib/wiring.mjs";

const MAX_SYMBOLS_DEFAULT = 15;
const C7_TTL_MS = 6 * 60 * 60 * 1000;
export const USAGE =
  "usage: node brief.mjs <target-path> [--max-symbols N] [--no-docs] [--no-lsp] [--help]";
const LIST_FAILED_PREFIX = "gitnexus list failed";

const BOOLEAN_FLAGS = {
  "--no-docs": "noDocs",
  "--no-lsp": "noLsp",
  "--help": "help",
  "-h": "help",
};

class UsageError extends Error {}

function maxSymbolsValue(raw) {
  const n = /^\d+$/.test(raw ?? "") ? Number.parseInt(raw, 10) : 0;
  if (n < 1) {
    throw new UsageError(
      `--max-symbols needs a positive integer, got ${raw ?? "nothing"}`,
    );
  }
  return n;
}

export function parseArgs(argv) {
  const out = {
    target: null,
    maxSymbols: MAX_SYMBOLS_DEFAULT,
    noDocs: false,
    noLsp: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--max-symbols") {
      i++;
      out.maxSymbols = maxSymbolsValue(argv[i]);
    } else if (Object.hasOwn(BOOLEAN_FLAGS, a)) out[BOOLEAN_FLAGS[a]] = true;
    else if (a.startsWith("-")) throw new UsageError(`unknown option ${a}`);
    else if (out.target === null) out.target = a;
    else throw new UsageError(`unexpected argument ${a}`);
  }
  return out;
}

function gitnexusStatus(freshness) {
  if (freshness.ok) {
    return freshness.stale
      ? `ran (index STALE, ${freshness.commitsBehind ?? "?"} commits behind)`
      : "ran (index current)";
  }
  return freshness.note.startsWith(LIST_FAILED_PREFIX)
    ? "not on PATH"
    : `unavailable (${freshness.note})`;
}

// The LSP passes return null only on failure; an empty Map means the server ran and found nothing.
export function lspStatus(result, probeOk) {
  if (!probeOk) return "not on PATH";
  if (result === null) return "FAILED (server did not initialise or exited)";
  return result.size === 0 ? "ran (no results)" : "ran";
}

export function codegraphStatus({ hasIndex, probeOk, lines }) {
  if (!hasIndex) return "no .codegraph index";
  if (!probeOk) return "not on PATH";
  return lines === null
    ? "FAILED (codegraph explore exited non-zero or timed out)"
    : "ran";
}

export function astGrepStatus(probeOk, hits) {
  if (!probeOk) return "not on PATH";
  return hits === null ? "skipped (no PHP scan dirs)" : "ran";
}

// A lookup that errored leaves that package's docs UNRESOLVED, so the status has to say so.
export function context7Status(gate) {
  const total = gate.perPackage.length;
  const failed = gate.perPackage.filter((e) => e.error).length;
  const anon = gate.anonymous ? ", anonymous — no CONTEXT7_API_KEY" : "";
  if (total > 0 && failed === total) {
    return `FAILED (all ${total} lookups failed${anon})`;
  }
  if (failed > 0) return `ran (${failed} of ${total} lookups FAILED${anon})`;
  return gate.anonymous ? "ran anonymously (no CONTEXT7_API_KEY)" : "ran";
}

async function runServer(ctx, files, server) {
  if (files.length === 0) return { result: null, status: server.notNeeded };
  const result = await server.fn(ctx, files);
  return { result, status: lspStatus(result, probe(server.cmd, ctx.env)) };
}

async function runLsp(ctx, opts, tools) {
  if (opts.noLsp) {
    tools.phpantom_lsp = "skipped (--no-lsp)";
    tools["typescript-language-server"] = "skipped (--no-lsp)";
    return { lsp: null, tsLsp: null };
  }
  const php = await runServer(
    ctx,
    ctx.files.filter((f) => f.endsWith(".php")),
    {
      fn: phpantomTypes,
      cmd: "phpantom_lsp",
      notNeeded: "not needed (no PHP files)",
    },
  );
  const ts = await runServer(
    ctx,
    ctx.files.filter((f) => TS_EXT_RE.test(f)),
    {
      fn: tsLspCallers,
      cmd: "typescript-language-server",
      notNeeded: "not needed (no TypeScript/JavaScript files)",
    },
  );
  tools.phpantom_lsp = php.status;
  tools["typescript-language-server"] = ts.status;
  return { lsp: php.result, tsLsp: ts.result };
}

async function runDocs(ctx, deps, opts, tools) {
  const depRows = deps.rows;
  if (opts.noDocs) {
    tools.context7 = "skipped (--no-docs)";
    return { gate: null, skippedReason: render.DOCS_SKIPPED };
  }
  if (depRows.length === 0 && deps.unread.length > 0) {
    tools.context7 = `skipped (no ${deps.unread.join(" or ")} read)`;
    return { gate: null, skippedReason: render.DOCS_NO_LOCKFILE };
  }
  if (depRows.length === 0) {
    tools.context7 = "not needed (no third-party imports)";
    return { gate: null, skippedReason: render.DOCS_NO_IMPORTS };
  }
  if (typeof globalThis.fetch !== "function") {
    tools.context7 = "UNAVAILABLE (no global fetch)";
    return { gate: null, skippedReason: render.DOCS_NO_FETCH };
  }
  const gate = await docSources(depRows, {
    fetchImpl: globalThis.fetch,
    cache: new TtlCache(defaultCacheDir(ctx.env), C7_TTL_MS),
    apiKey: ctx.env.CONTEXT7_API_KEY,
    searchUrl: ctx.env.INVESTIGATE_BRIEF_C7_URL,
  });
  tools.context7 = context7Status(gate);
  return { gate, skippedReason: null };
}

function runCodegraph(ctx, symbols, tools) {
  const lines = codegraphOverview(
    ctx,
    symbols.map((s) => s.name),
  );
  const hasIndex = existsSync(path.join(ctx.repoRoot, ".codegraph"));
  tools.codegraph = codegraphStatus({
    hasIndex,
    probeOk: hasIndex && probe("codegraph", ctx.env),
    lines,
  });
  return lines;
}

function runAstGrep(ctx, tools) {
  const probeOk = probe("ast-grep", ctx.env);
  // astGrepHits caches per ctx, so the wiring scan reuses this result.
  tools["ast-grep"] = astGrepStatus(probeOk, probeOk ? astGrepHits(ctx) : null);
}

function symbolSection(ctx, sym, state) {
  const abs = path.join(ctx.repoRoot, sym.file);
  return render.renderSymbol(sym, {
    dupes: duplicateDefinitions(ctx, sym.name, sym.file),
    typeRows: state.lsp?.get(abs) ?? null,
    tsCallers: state.tsLsp?.get(abs) ?? null,
    graph: state.freshness.ok ? graphContext(ctx, sym.name) : null,
    freshnessOk: state.freshness.ok,
    wiring: wiringFor(ctx, sym.name),
  });
}

function loadContext(target, env) {
  const repo = resolveRepo(target, env);
  const files = collectFiles(repo.target);
  if (files.length === 0) {
    throw new Error(`no source files found under ${repo.relTarget}`);
  }
  return { ...repo, files, env };
}

async function buildBrief(opts, io) {
  const ctx = loadContext(opts.target, io.env);
  const tools = { git: "ran" };
  const freshness = indexFreshness(ctx);
  tools.gitnexus = gitnexusStatus(freshness);
  const { symbols, truncated } = deriveSymbols(
    ctx.files,
    ctx.repoRoot,
    opts.maxSymbols,
  );
  const { lsp, tsLsp } = await runLsp(ctx, opts, tools);
  runAstGrep(ctx, tools);
  const deps = collectDependencies(ctx);
  const docs = await runDocs(ctx, deps, opts, tools);
  const cg = runCodegraph(ctx, symbols, tools);

  const state = { lsp, tsLsp, freshness };
  const lines = [
    ...render.renderHeader(ctx.relTarget, ctx.repoName),
    ...render.renderTools(tools),
    ...render.renderIndex(freshness),
    ...render.renderFiles(ctx.files, ctx.repoRoot, truncated, opts.maxSymbols),
    ...render.renderDependencies(deps.rows, deps.unread),
    ...render.renderDocSources(docs.gate, docs.skippedReason),
    ...render.renderCodegraph(cg),
    ...symbols.flatMap((sym) => symbolSection(ctx, sym, state)),
    ...render.renderFooter(),
  ];
  await writeAll(io.stdout, `${lines.join("\n")}\n`);
}

// A pipe write can still be queued when it returns, so wait for the flush callback.
function writeAll(stream, text) {
  return new Promise((resolve, reject) => {
    stream.write(text, (err) => (err ? reject(err) : resolve()));
  });
}

function parseOrReport(argv, io) {
  try {
    return parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    io.stderr.write(`brief.mjs: ${e.message}\n${USAGE}\n`);
    return null;
  }
}

export async function main(argv, io) {
  const opts = parseOrReport(argv, io);
  if (opts === null) return 1;
  if (opts.help) {
    await writeAll(io.stdout, `${USAGE}\n`);
    return 0;
  }
  if (!opts.target) {
    io.stderr.write(`${USAGE}\n`);
    return 1;
  }
  try {
    await buildBrief(opts, io);
    return 0;
  } catch (e) {
    io.stderr.write(`brief.mjs: ${e?.message ?? e}\n`);
    return 1;
  }
}

if (
  process.argv[1] &&
  // Node runs the main module from its realpath, so compare against the realpath too.
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  // exitCode, not exit(): exit() drops stdout still queued for a pipe.
  process.exitCode = await main(process.argv.slice(2), {
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
