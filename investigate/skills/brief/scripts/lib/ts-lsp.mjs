import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLASS_KIND,
  closeDocument,
  FUNCTION_KIND,
  fileUri,
  flattenSymbols,
  openDocument,
  perFile,
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

function locOf(ctx, from) {
  const rel = path.relative(ctx.repoRoot, fileURLToPath(from.uri));
  return `${rel}:${from.range.start.line + 1}`;
}

async function callersOf(client, ctx, file, primary) {
  const items = await client.request(
    "textDocument/prepareCallHierarchy",
    {
      textDocument: { uri: fileUri(file) },
      position: primary.selectionRange.start,
    },
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
    loc: locOf(ctx, c.from),
    sites: (c.fromRanges ?? []).length,
  }));
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
      { textDocument: { uri: fileUri(file) } },
      SYMBOL_TIMEOUT_MS,
    );
    const primary = primarySymbol(syms, file);
    if (!primary) return null;
    const rows = await callersOf(client, ctx, file, primary);
    return rows.length ? { symbol: primary.name, rows } : null;
  } finally {
    closeDocument(client, file);
  }
}

export function tsLspCallers(ctx, tsFiles, cmd = "typescript-language-server") {
  return withClient(cmd, ctx, INIT_TIMEOUT_MS, (client) =>
    perFile(client, tsFiles, (c, file) => fileCallers(c, ctx, file)),
  );
}
