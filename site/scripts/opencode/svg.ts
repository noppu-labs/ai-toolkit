const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

const ENTITY = /&(?:#(\d+)|#x([0-9a-f]+)|(lt|gt|amp|quot|apos));?/gi;
const INTERNAL_SUBSET = /<!DOCTYPE(?:[^>[\]"']|"[^"]*"|'[^']*')*\[/i;
// Any namespace prefix, since XML names can hold letters outside ASCII.
const ACTIVE_MARKUP =
  /<(?:[^\s<>/:=]+:)?(?:script|foreignobject)\b|[\s"'/]on[a-z]+\s*=/i;
const JAVASCRIPT_URL = /javascript:/i;
// URL parsers drop these anywhere in a URL, so `java&#9;script:` still runs.
const URL_IGNORED = /[\t\n\r]/g;
// Up to the first `?>`, which covers the part each browser searches for the
// encoding.
const XML_DECLARATION = /^\s*<\?xml[\s\S]*?(?:\?>|$)/i;
const ENCODING_NAME = /encoding/gi;
const UTF8_ENCODING = /\sencoding\s*=\s*(["'])utf-8\1/i;
const MAX_CODE_POINT = 0x10_ffff;
const HEX = 16;
const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const SPACE = 0x20;

/** A C0 control byte that XML 1.0 forbids, which also covers NUL and the escapes of ISO-2022. */
function isForbiddenControl(byte: number): boolean {
  return (
    byte < SPACE &&
    byte !== TAB &&
    byte !== LINE_FEED &&
    byte !== CARRIAGE_RETURN
  );
}

function isUtf16OrBinary(bytes: Uint8Array): boolean {
  const [first, second] = bytes;
  const bom =
    (first === 0xff && second === 0xfe) || (first === 0xfe && second === 0xff);
  return bom || bytes.some(isForbiddenControl);
}

/**
 * Whether the XML declaration names an encoding other than UTF-8, or names one
 * twice. A browser decodes the file with the declared encoding, and this check
 * reads it as UTF-8.
 */
function declaresOtherEncoding(text: string): boolean {
  const declaration = XML_DECLARATION.exec(text)?.[0] ?? "";
  const named = declaration.match(ENCODING_NAME)?.length ?? 0;
  return named > 1 || (named === 1 && !UTF8_ENCODING.test(declaration));
}

function decodeEntity(
  match: string,
  decimal: string | undefined,
  hex: string | undefined,
  named: string | undefined,
): string {
  if (named !== undefined) {
    return NAMED_ENTITIES[named.toLowerCase()] ?? match;
  }
  const code = Number.parseInt(
    decimal ?? hex ?? "",
    decimal === undefined ? HEX : 10,
  );
  return code <= MAX_CODE_POINT ? String.fromCodePoint(code) : "";
}

function readUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** Whether an SVG could run script or load a foreign document in a browser. */
export function svgHasActiveContent(bytes: Uint8Array): boolean {
  if (isUtf16OrBinary(bytes)) {
    return true;
  }
  const text = readUtf8(bytes);
  if (
    text === undefined ||
    declaresOtherEncoding(text) ||
    INTERNAL_SUBSET.test(text) ||
    /<!ENTITY/i.test(text)
  ) {
    return true;
  }
  const decoded = text.replace(ENTITY, decodeEntity);
  return (
    ACTIVE_MARKUP.test(decoded) ||
    JAVASCRIPT_URL.test(decoded.replace(URL_IGNORED, ""))
  );
}
