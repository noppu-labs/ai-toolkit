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
import { duplicateDefinitions, wiringFor } from "./lib/wiring.mjs";

const MAX_SYMBOLS_DEFAULT = 15;
const C7_TTL_MS = 6 * 60 * 60 * 1000;
const USAGE =
  "usage: node brief.mjs <target-path> [--max-symbols N] [--no-docs] [--no-lsp]";
const LIST_FAILED_PREFIX = "gitnexus list failed";

const BOOLEAN_FLAGS = {
  "--no-docs": "noDocs",
  "--no-lsp": "noLsp",
  "--help": "help",
  "-h": "help",
};

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
      out.maxSymbols = Number.parseInt(argv[i], 10) || MAX_SYMBOLS_DEFAULT;
    } else if (Object.hasOwn(BOOLEAN_FLAGS, a)) out[BOOLEAN_FLAGS[a]] = true;
    else if (!out.target) out.target = a;
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

function lspStatus(result, cmd, env) {
  if (result !== null) return "ran";
  return probe(cmd, env) ? "ran (no results)" : "not on PATH";
}

async function runServer(ctx, files, server) {
  if (files.length === 0) return { result: null, status: server.notNeeded };
  const result = await server.fn(ctx, files);
  return { result, status: lspStatus(result, server.cmd, ctx.env) };
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

async function runDocs(ctx, depRows, opts, tools) {
  if (opts.noDocs) {
    tools.context7 = "skipped (--no-docs)";
    return { gate: null, skippedReason: "--no-docs" };
  }
  if (depRows.length === 0) {
    tools.context7 = "not needed (no third-party imports)";
    return { gate: null, skippedReason: "no third-party imports" };
  }
  if (typeof globalThis.fetch !== "function") {
    tools.context7 = "UNAVAILABLE (no global fetch)";
    return { gate: null, skippedReason: null };
  }
  const gate = await docSources(depRows, {
    fetchImpl: globalThis.fetch,
    cache: new TtlCache(defaultCacheDir(ctx.env), C7_TTL_MS),
    apiKey: ctx.env.CONTEXT7_API_KEY,
    searchUrl: ctx.env.INVESTIGATE_BRIEF_C7_URL,
  });
  tools.context7 = gate.anonymous
    ? "ran anonymously (no CONTEXT7_API_KEY)"
    : "ran";
  return { gate, skippedReason: null };
}

function codegraphStatus(ctx, lines) {
  if (lines !== null) return "ran";
  if (!existsSync(path.join(ctx.repoRoot, ".codegraph"))) {
    return "no .codegraph index";
  }
  return probe("codegraph", ctx.env) ? "ran (no results)" : "not on PATH";
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

export async function main(argv, io) {
  const opts = parseArgs(argv);
  if (opts.help) {
    io.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (!opts.target) {
    io.stderr.write(`${USAGE}\n`);
    return 1;
  }
  let ctx;
  try {
    ctx = loadContext(opts.target, io.env);
  } catch (e) {
    io.stderr.write(`brief.mjs: ${e.message}\n`);
    return 1;
  }

  const tools = { git: "ran" };
  const freshness = indexFreshness(ctx);
  tools.gitnexus = gitnexusStatus(freshness);
  const { symbols, truncated } = deriveSymbols(
    ctx.files,
    ctx.repoRoot,
    opts.maxSymbols,
  );
  const { lsp, tsLsp } = await runLsp(ctx, opts, tools);
  tools["ast-grep"] = probe("ast-grep", ctx.env) ? "ran" : "not on PATH";
  const depRows = collectDependencies(ctx);
  const docs = await runDocs(ctx, depRows, opts, tools);
  const cg = codegraphOverview(
    ctx,
    symbols.map((s) => s.name),
  );
  tools.codegraph = codegraphStatus(ctx, cg);

  const state = { lsp, tsLsp, freshness };
  const lines = [
    ...render.renderHeader(ctx.relTarget, ctx.repoName),
    ...render.renderTools(tools),
    ...render.renderIndex(freshness),
    ...render.renderFiles(ctx.files, ctx.repoRoot, truncated, opts.maxSymbols),
    ...(depRows.length
      ? [
          ...render.renderDependencies(depRows),
          ...render.renderDocSources(docs.gate, docs.skippedReason),
        ]
      : []),
    ...render.renderCodegraph(cg),
    ...symbols.flatMap((sym) => symbolSection(ctx, sym, state)),
    ...render.renderFooter(),
  ];
  io.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

if (
  process.argv[1] &&
  // Node runs the main module from its realpath, so compare against the realpath too.
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  const code = await main(process.argv.slice(2), {
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(code);
}
