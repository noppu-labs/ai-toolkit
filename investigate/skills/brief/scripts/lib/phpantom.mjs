import { readFileSync } from "node:fs";
import {
  CONSTRUCTOR_KIND,
  closeDocument,
  fileUri,
  flattenSymbols,
  METHOD_KIND,
  openDocument,
  perFile,
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

async function typesFor(client, file) {
  openDocument(client, file, "php", readFileSync(file, "utf8"));
  try {
    const syms = await client.request(
      "textDocument/documentSymbol",
      { textDocument: { uri: fileUri(file) } },
      SYMBOL_TIMEOUT_MS,
    );
    const rows = methodRows(syms ?? []);
    return rows.length ? rows : null;
  } finally {
    closeDocument(client, file);
  }
}

export function phpantomTypes(ctx, phpFiles, cmd = "phpantom_lsp") {
  return withClient(cmd, ctx, INIT_TIMEOUT_MS, (client) =>
    perFile(client, phpFiles, typesFor),
  );
}
