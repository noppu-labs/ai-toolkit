import { readFileSync } from "node:fs";
import path from "node:path";
import { probe } from "./exec.mjs";
import {
  CLASS_KIND,
  closeDocument,
  FUNCTION_KIND,
  flattenSymbols,
  openDocument,
  withClient,
} from "./lsp-client.mjs";

const INIT_TIMEOUT_MS = 60_000;
// The first request after didOpen waits for the tsserver project load.
const SYMBOL_TIMEOUT_MS = 45_000;
const CALL_HIERARCHY_TIMEOUT_MS = 20_000;
const MAX_TS_CALLERS = 12;
const REACT_EXT_RE = /\.[jt]sx$/;

function primarySymbol(syms, file) {
  const flat = flattenSymbols(syms);
  const primaryName = path.basename(file).replace(/\.[^.]+$/, "");
  return (
    flat.find((s) => s.name === primaryName && s.selectionRange) ??
    flat.find(
      (s) =>
        (s.kind === CLASS_KIND || s.kind === FUNCTION_KIND) && s.selectionRange,
    )
  );
}

async function callersOf(client, ctx, file, primary) {
  const uri = `file://${file}`;
  try {
    const items = await client.request(
      "textDocument/prepareCallHierarchy",
      { textDocument: { uri }, position: primary.selectionRange.start },
      CALL_HIERARCHY_TIMEOUT_MS,
    );
    if (!items?.length) return [];
    const calls = await client.request(
      "callHierarchy/incomingCalls",
      { item: items[0] },
      CALL_HIERARCHY_TIMEOUT_MS,
    );
    return (calls ?? []).slice(0, MAX_TS_CALLERS).map((c) => ({
      name: c.from.name,
      loc: `${c.from.uri.replace(`file://${ctx.repoRoot}/`, "")}:${c.from.range.start.line + 1}`,
      sites: (c.fromRanges ?? []).length,
    }));
  } catch {
    return [];
  }
}

async function fileCallers(client, ctx, file) {
  openDocument(
    client,
    file,
    REACT_EXT_RE.test(file) ? "typescriptreact" : "typescript",
    readFileSync(file, "utf8"),
  );
  try {
    const syms = await client.request(
      "textDocument/documentSymbol",
      { textDocument: { uri: `file://${file}` } },
      SYMBOL_TIMEOUT_MS,
    );
    const primary = primarySymbol(syms, file);
    if (!primary) return null;
    const rows = await callersOf(client, ctx, file, primary);
    return rows.length ? { symbol: primary.name, rows } : null;
  } catch {
    return null;
  } finally {
    closeDocument(client, file);
  }
}

export async function tsLspCallers(
  ctx,
  tsFiles,
  cmd = "typescript-language-server",
) {
  if (tsFiles.length === 0 || !probe(cmd, ctx.env)) return null;
  return withClient(cmd, ctx, INIT_TIMEOUT_MS, async (client) => {
    const out = new Map();
    for (const file of tsFiles) {
      // biome-ignore lint/performance/noAwaitInLoops: one LSP connection; requests must be sequential
      const entry = await fileCallers(client, ctx, file);
      if (entry) out.set(file, entry);
    }
    return out;
  });
}
