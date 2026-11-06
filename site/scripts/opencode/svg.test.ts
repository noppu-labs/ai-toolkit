import { describe, expect, it } from "vitest";
import { svgHasActiveContent } from "./svg.ts";

const enc = new TextEncoder();
const check = (svg: string): boolean => svgHasActiveContent(enc.encode(svg));
const REF = "&#106";
const BODY = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/></svg>';

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
});
