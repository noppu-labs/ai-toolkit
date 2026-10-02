import { readFileSync } from "node:fs";
import { probe } from "./exec.mjs";
import {
  CONSTRUCTOR_KIND,
  closeDocument,
  flattenSymbols,
  METHOD_KIND,
  openDocument,
  withClient,
} from "./lsp-client.mjs";

const INIT_TIMEOUT_MS = 90_000;
const SYMBOL_TIMEOUT_MS = 15_000;
const MAX_METHODS_PER_CLASS = 25;
const DETAIL_CAP = 180;

function methodRows(syms) {
  return flattenSymbols(syms)
    .filter(
      (s) =>
        (s.kind === METHOD_KIND || s.kind === CONSTRUCTOR_KIND) && s.detail,
    )
    .slice(0, MAX_METHODS_PER_CLASS)
    .map((s) => ({
      name: s.name,
      detail: `${s.name}${s.detail}`.slice(0, DETAIL_CAP),
    }));
}

async function symbolsFor(client, file) {
  openDocument(client, file, "php", readFileSync(file, "utf8"));
  try {
    return await client.request(
      "textDocument/documentSymbol",
      { textDocument: { uri: `file://${file}` } },
      SYMBOL_TIMEOUT_MS,
    );
  } catch {
    return null;
  } finally {
    closeDocument(client, file);
  }
}

export async function phpantomTypes(ctx, phpFiles, cmd = "phpantom_lsp") {
  if (phpFiles.length === 0 || !probe(cmd, ctx.env)) return null;
  return withClient(cmd, ctx, INIT_TIMEOUT_MS, async (client) => {
    const out = new Map();
    for (const file of phpFiles) {
      // biome-ignore lint/performance/noAwaitInLoops: one LSP connection; requests must be sequential
      const syms = await symbolsFor(client, file);
      const rows = methodRows(syms ?? []);
      if (rows.length) out.set(file, rows);
    }
    return out;
  });
}
