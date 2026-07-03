/**
 * Minimal frontmatter parser for SKILL.md headers (flat `key: value` pairs
 * between `---` delimiters). Node builtins only, mirroring skills-sync.
 */
export function parseFrontmatter(
  content: string,
  sourcePath: string,
): Record<string, string> {
  if (!content.startsWith("---\n")) {
    throw new Error(`${sourcePath}: missing frontmatter opening delimiter`);
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) {
    throw new Error(`${sourcePath}: missing frontmatter closing delimiter`);
  }
  const fields: Record<string, string> = {};
  for (const line of content.slice(4, end).split("\n")) {
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
