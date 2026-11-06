const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

const ENTITY = /&(?:#(\d+)|#x([0-9a-f]+)|(lt|gt|amp|quot|apos));?/gi;
const INTERNAL_SUBSET = /<!DOCTYPE(?:[^>[\]"']|"[^"]*"|'[^']*')*\[/i;
const ACTIVE =
  /<(?:[\w.-]+:)?(?:script|foreignobject)\b|[\s"'/]on[a-z]+\s*=|javascript:/i;
const MAX_CODE_POINT = 0x10_ffff;
const HEX = 16;

function isUtf16OrBinary(bytes: Uint8Array): boolean {
  const [first, second] = bytes;
  const bom =
    (first === 0xff && second === 0xfe) || (first === 0xfe && second === 0xff);
  return bom || bytes.includes(0);
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
    INTERNAL_SUBSET.test(text) ||
    /<!ENTITY/i.test(text)
  ) {
    return true;
  }
  return ACTIVE.test(text.replace(ENTITY, decodeEntity));
}
