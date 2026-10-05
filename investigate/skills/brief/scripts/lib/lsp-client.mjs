import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const CLASS_KIND = 5;
export const METHOD_KIND = 6;
export const CONSTRUCTOR_KIND = 9;
export const FUNCTION_KIND = 12;
const SEPARATOR = "\r\n\r\n";
const STDERR_KEEP_CHARS = 4096;
const REASON_CAP = 240;

export const fileUri = (file) => pathToFileURL(file).href;

export class FrameParser {
  #buf = Buffer.alloc(0);

  push(chunk) {
    this.#buf = Buffer.concat([this.#buf, chunk]);
    const out = [];
    for (let msg = this.#next(); msg !== undefined; msg = this.#next()) {
      if (msg !== null) out.push(msg);
    }
    return out;
  }

  /** @returns undefined when no complete frame is buffered, null for a skipped frame */
  #next() {
    const headerEnd = this.#buf.indexOf(SEPARATOR);
    if (headerEnd === -1) return undefined;
    const m = /Content-Length: (\d+)/i.exec(
      this.#buf.subarray(0, headerEnd).toString(),
    );
    if (!m) {
      this.#buf = this.#buf.subarray(headerEnd + SEPARATOR.length);
      return null;
    }
    const total = headerEnd + SEPARATOR.length + Number.parseInt(m[1], 10);
    if (this.#buf.length < total) return undefined;
    const body = this.#buf
      .subarray(headerEnd + SEPARATOR.length, total)
      .toString();
    this.#buf = this.#buf.subarray(total);
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
}

export class LspClient {
  #proc;
  #parser = new FrameParser();
  #nextId = 1;
  #pending = new Map();
  #closed = false;
  #stderr = "";

  constructor(cmd, args, cwd, env = process.env) {
    this.#proc = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#proc.stdout.on("data", (d) => {
      for (const msg of this.#parser.push(d)) this.#onMessage(msg);
    });
    this.#proc.stderr.on("data", (d) => {
      this.#stderr = `${this.#stderr}${d}`.slice(-STDERR_KEEP_CHARS);
    });
    // A server that fails to start or dies mid-session fails its pending and later requests instead of hanging them.
    // "close" fires after stdout drains, so a reply written just before exit is still delivered.
    this.#proc.on("error", (err) => this.#close(err));
    this.#proc.on("close", (code, signal) =>
      this.#close(new Error(`server exited (${signal ?? `code ${code}`})`)),
    );
    this.#proc.stdin.on("error", () => {
      /* EPIPE after the server exits; requests fail through the close handler */
    });
  }

  #close(err) {
    this.#closed = true;
    for (const p of this.#pending.values()) p.reject(err);
    this.#pending.clear();
  }

  #onMessage(msg) {
    if (msg.id !== undefined && msg.method) {
      this.#write({ jsonrpc: "2.0", id: msg.id, result: null });
      return;
    }
    const p = this.#pending.get(msg.id);
    if (!p) return;
    this.#pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
    else p.resolve(msg.result);
  }

  /** The last non-empty stderr line, for a failure reason. */
  stderrTail() {
    return this.#stderr.trim().split("\n").filter(Boolean).at(-1) ?? "";
  }

  #write(obj) {
    if (this.#closed) return;
    const s = JSON.stringify(obj);
    this.#proc.stdin.write(
      `Content-Length: ${Buffer.byteLength(s)}${SEPARATOR}${s}`,
    );
  }

  request(method, params, timeoutMs) {
    if (this.#closed) {
      return Promise.reject(new Error(`server exited: ${method}`));
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }, timeoutMs);
      const settle = (fn) => (v) => {
        clearTimeout(timer);
        fn(v);
      };
      this.#pending.set(id, {
        method,
        resolve: settle(resolve),
        reject: settle(reject),
      });
      this.#write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method, params) {
    this.#write({ jsonrpc: "2.0", method, params });
  }

  kill() {
    try {
      this.#proc.kill();
    } catch {
      /* already gone */
    }
  }
}

export function flattenSymbols(syms, acc = []) {
  for (const s of syms ?? []) {
    acc.push(s);
    if (s.children) flattenSymbols(s.children, acc);
  }
  return acc;
}

// One line: the error, then the server's own last stderr line when it left one.
function failureReason(err, client) {
  const tail = client.stderrTail();
  const reason = `${err?.message ?? err}${tail ? `; stderr: ${tail}` : ""}`;

  return reason.replace(/\s+/g, " ").slice(0, REASON_CAP);
}

/**
 * Runs body over one initialised connection. A failure to start or initialise
 * returns { error }; body reports per-file failures in its own result.
 */
export async function withClient(cmd, ctx, initTimeoutMs, body) {
  const client = new LspClient(cmd, ["--stdio"], ctx.repoRoot, ctx.env);
  const rootUri = fileUri(ctx.repoRoot);
  try {
    await client.request(
      "initialize",
      {
        processId: process.pid,
        rootUri,
        capabilities: {
          textDocument: {
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          },
        },
        workspaceFolders: [{ uri: rootUri, name: ctx.repoName }],
      },
      initTimeoutMs,
    );
    client.notify("initialized", {});
    return await body(client);
  } catch (e) {
    return { error: failureReason(e, client) };
  } finally {
    client.kill();
  }
}

/** Runs one request batch per file in order, recording each file that failed. */
export async function perFile(client, files, fn) {
  const results = new Map();
  const failures = [];
  for (const file of files) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one LSP connection; requests must be sequential
      const entry = await fn(client, file);
      if (entry) results.set(file, entry);
    } catch (e) {
      failures.push(failureReason(e, client));
    }
  }
  return { results, failures, total: files.length };
}

export function openDocument(client, file, languageId, text) {
  client.notify("textDocument/didOpen", {
    textDocument: { uri: fileUri(file), languageId, version: 1, text },
  });
}

export function closeDocument(client, file) {
  client.notify("textDocument/didClose", {
    textDocument: { uri: fileUri(file) },
  });
}
