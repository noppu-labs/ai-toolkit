/** A line holding exactly `---`, so a longer rule such as `----` does not close the header. */
const CLOSING_FENCE = /\n---(?:\n|$)/;

export interface Frontmatter {
  fields: Record<string, string>;
  body: string;
}

function parseFields(
  header: string,
  sourcePath: string,
): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const line of header.split("\n")) {
    if (line.trim() === "") {
      continue;
    }

    const colon = line.indexOf(":");

    if (colon === -1) {
      throw new Error(`${sourcePath}: malformed frontmatter line: ${line}`);
    }

    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }

  return fields;
}

/**
 * Minimal parser for SKILL.md headers (flat `key: value` pairs between `---` delimiters).
 * Node builtins only, mirroring skills-sync.
 */
export function splitFrontmatter(
  content: string,
  sourcePath: string,
): Frontmatter {
  if (!content.startsWith("---\n")) {
    throw new Error(`${sourcePath}: missing frontmatter opening delimiter`);
  }

  // From the opening fence's newline, so an empty header closes at once.
  const closing = CLOSING_FENCE.exec(content.slice(3));

  if (closing === null) {
    throw new Error(`${sourcePath}: missing frontmatter closing delimiter`);
  }

  const end = 3 + closing.index;

  return {
    fields: parseFields(content.slice(4, end), sourcePath),
    body: content.slice(end + closing[0].length),
  };
}

export function parseFrontmatter(
  content: string,
  sourcePath: string,
): Record<string, string> {
  return splitFrontmatter(content, sourcePath).fields;
}
