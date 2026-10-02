#!/usr/bin/env node
import { basename } from "node:path";

if (process.argv.includes("--version")) {
  process.stdout.write("fake 1.0\n");
  process.exit(0);
}

const CONFIG_REQUEST_ID = 999;
const exitAfterInit = process.env.FAKE_LSP_EXIT_AFTER_INIT === "1";

let buf = Buffer.alloc(0);
let root = "";
let sentBad = false;
let gotConfigReply = false;
const held = [];

function send(obj, done) {
  const s = JSON.stringify(obj);
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`,
    done,
  );
}

function symbolsFor(uri) {
  const name = basename(uri).replace(/\.[^.]+$/, "");
  const range = {
    start: { line: 1, character: 0 },
    end: { line: 9, character: 0 },
  };
  return [
    {
      name,
      kind: 5,
      range,
      selectionRange: range,
      children: [
        {
          name: "find",
          kind: 6,
          detail: "(int $id): ?Invoice",
          range,
          selectionRange: range,
        },
        {
          name: "__construct",
          kind: 9,
          detail: "(Repo $r)",
          range,
          selectionRange: range,
        },
      ],
    },
  ];
}

function callersFor() {
  return [
    {
      from: {
        name: "Home",
        uri: `file://${root}/src/pages/Home.tsx`,
        range: { start: { line: 9 } },
      },
      fromRanges: [{}, {}],
    },
    {
      from: {
        name: "Nav",
        uri: `file://${root}/src/Nav.tsx`,
        range: { start: { line: 1 } },
      },
      fromRanges: [{}],
    },
  ];
}

function itemFor(uri) {
  const range = {
    start: { line: 1, character: 0 },
    end: { line: 1, character: 5 },
  };
  return [
    {
      name: basename(uri).replace(/\.[^.]+$/, ""),
      uri,
      range,
      selectionRange: range,
    },
  ];
}

const results = {
  "textDocument/documentSymbol": (params) =>
    symbolsFor(params.textDocument.uri),
  "textDocument/prepareCallHierarchy": (params) =>
    itemFor(params.textDocument.uri),
  "callHierarchy/incomingCalls": callersFor,
};

function reply(msg) {
  if (!sentBad) {
    sentBad = true;
    process.stdout.write("Content-Length: 5\r\n\r\n{bad}");
  }
  send({
    jsonrpc: "2.0",
    id: msg.id,
    result: results[msg.method]?.(msg.params) ?? null,
  });
}

// Replies are held until the client answers workspace/configuration, so a client
// that ignores server-to-client requests never gets its symbols.
function onResponse(msg) {
  if (msg.id !== CONFIG_REQUEST_ID) return;
  gotConfigReply = true;
  for (const m of held.splice(0)) reply(m);
}

function handle(msg) {
  if (msg.method === undefined) {
    onResponse(msg);
    return;
  }
  if (msg.method === "initialize") {
    root = String(msg.params.rootUri).replace("file://", "");
    const done = exitAfterInit ? () => process.exit(0) : undefined;
    send({ jsonrpc: "2.0", id: msg.id, result: { capabilities: {} } }, done);
    return;
  }
  if (msg.method === "initialized") {
    send({
      jsonrpc: "2.0",
      id: CONFIG_REQUEST_ID,
      method: "workspace/configuration",
      params: {},
    });
    return;
  }
  if (msg.id === undefined) return;
  if (gotConfigReply) reply(msg);
  else held.push(msg);
}

process.stdin.on("data", (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const end = buf.indexOf("\r\n\r\n");
    if (end === -1) return;
    const len = Number(
      /Content-Length: (\d+)/i.exec(buf.subarray(0, end).toString())?.[1],
    );
    if (buf.length < end + 4 + len) return;
    const body = buf.subarray(end + 4, end + 4 + len).toString();
    buf = buf.subarray(end + 4 + len);
    handle(JSON.parse(body));
  }
});
