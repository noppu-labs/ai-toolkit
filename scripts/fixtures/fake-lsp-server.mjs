#!/usr/bin/env node
import { basename } from "node:path";

if (process.argv.includes("--version")) {
  process.stdout.write("fake 1.0\n");
  process.exit(0);
}

let buf = Buffer.alloc(0);
let root = "";
let sentBad = false;

function send(obj) {
  const s = JSON.stringify(obj);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`);
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

function handle(msg) {
  if (msg.method === "initialize") {
    root = String(msg.params.rootUri).replace("file://", "");
    send({ jsonrpc: "2.0", id: msg.id, result: { capabilities: {} } });
    return;
  }
  if (msg.method === "initialized") {
    send({
      jsonrpc: "2.0",
      id: 999,
      method: "workspace/configuration",
      params: {},
    });
    return;
  }
  if (msg.id === undefined) return;
  if (!sentBad) {
    sentBad = true;
    process.stdout.write("Content-Length: 5\r\n\r\n{bad}");
  }
  const results = {
    "textDocument/documentSymbol": () =>
      symbolsFor(msg.params.textDocument.uri),
    "textDocument/prepareCallHierarchy": () => {
      const range = {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 5 },
      };
      return [
        {
          name: basename(msg.params.textDocument.uri).replace(/\.[^.]+$/, ""),
          uri: msg.params.textDocument.uri,
          range,
          selectionRange: range,
        },
      ];
    },
    "callHierarchy/incomingCalls": callersFor,
  };
  send({ jsonrpc: "2.0", id: msg.id, result: results[msg.method]?.() ?? null });
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
