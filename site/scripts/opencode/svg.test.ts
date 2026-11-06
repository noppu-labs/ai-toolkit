import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { svgHasActiveContent } from "./svg.ts";

const enc = new TextEncoder();
const check = (svg: string): boolean => svgHasActiveContent(enc.encode(svg));
const REF = "&#106";
const BODY = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/></svg>';
const declaration = (encoding: string): string =>
  `<?xml version="1.0" encoding="${encoding}"?>`;
const SYNCED = fileURLToPath(
  new URL("../../src/content/opencode", import.meta.url),
);

describe("svgHasActiveContent", () => {
  it("accepts a plain SVG and one with the usual external DOCTYPE", () => {
    expect(check(BODY)).toBe(false);
    expect(
      check(
        `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.0//EN" "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd">\n${BODY}`,
      ),
    ).toBe(false);
  });

  it.each([
    ["a script element", "<svg><script>x()</script></svg>"],
    ["an uppercase script", "<svg><SCRIPT>x()</SCRIPT></svg>"],
    ["an event attribute", '<svg onload="x()"/>'],
    ["a javascript: URL", '<svg><a href="javascript:x()"/></svg>'],
    ["a foreignObject", "<svg><foreignObject/></svg>"],
    [
      "a prefixed script",
      '<svg xmlns:s="http://www.w3.org/2000/svg"><s:script>x()</s:script></svg>',
    ],
    ["a numeric reference", '<svg><a href="&#106;avascript:alert(1)"/></svg>'],
    ["a reference without semicolon", `<a href="${REF}avascript:x()"/>`],
    [
      "an entity expanding to a script",
      '<!DOCTYPE svg [<!ENTITY x "<script>">]><svg>&x;</svg>',
    ],
    ["an ENTITY declaration", '<!ENTITY x "y"><svg/>'],
    [
      "a script with a non-ASCII prefix",
      '<svg xmlns:é="http://www.w3.org/2000/svg"><é:script>x()</é:script></svg>',
    ],
    ["a tab inside javascript:", '<svg><a href="java&#9;script:x()"/></svg>'],
    [
      "a newline inside javascript:",
      '<svg><a href="java&#xA;script:x()"/></svg>',
    ],
    [
      "a script hidden by a declared ISO-2022-JP",
      `${declaration("ISO-2022-JP")}<svg><scr\x1b(Bipt>x()</script></svg>`,
    ],
    [
      "a declared encoding other than UTF-8",
      `${declaration("ISO-8859-1")}${BODY}`,
    ],
    ["a C0 control byte", `<svg>\x01</svg>`],
  ])("rejects %s", (_label, svg) => {
    expect(check(svg)).toBe(true);
  });

  it("rejects UTF-16 with a BOM, other NUL bytes and invalid UTF-8", () => {
    expect(
      svgHasActiveContent(Buffer.from("﻿<svg><script/></svg>", "utf16le")),
    ).toBe(true);
    expect(svgHasActiveContent(Uint8Array.from([0x3c, 0x00, 0x73]))).toBe(true);
    expect(svgHasActiveContent(Uint8Array.from([0x3c, 0xff, 0xc3]))).toBe(true);
  });

  it("accepts a UTF-8 declaration in either case, or one with no encoding", () => {
    expect(check(`${declaration("utf-8")}\r\n\t${BODY}`)).toBe(false);
    expect(check(`<?xml version='1.0' encoding='UTF-8'?>${BODY}`)).toBe(false);
    expect(check(`<?xml version="1.0"?>${BODY}`)).toBe(false);
  });

  it("accepts every synced SVG figure", () => {
    const figures = readdirSync(SYNCED, {
      recursive: true,
      encoding: "utf8",
    }).filter((path) => path.endsWith(".svg"));
    expect(figures.length).toBeGreaterThan(0);
    for (const path of figures) {
      expect(svgHasActiveContent(readFileSync(join(SYNCED, path))), path).toBe(
        false,
      );
    }
  });
});
