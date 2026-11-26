import { isAbsolute, relative, sep } from "node:path";
import { UNSAFE_BRANCH_CHARS } from "./constants.mjs";

export function quoteShell(word) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word)) {
    return word;
  }

  return `'${word.replaceAll("'", "'\\''")}'`;
}

export function isValidBranch(name) {
  return (
    typeof name === "string" &&
    name !== "" &&
    !name.startsWith("-") &&
    [...name].every(
      (char) =>
        char.charCodeAt(0) > 32 &&
        char.charCodeAt(0) !== 127 &&
        !UNSAFE_BRANCH_CHARS.includes(char),
    )
  );
}

// A path is data: a control character in it would print as a line break or an
// escape sequence wherever the path is shown.
export function showPath(path) {
  return [...path]
    .map((char) => {
      const code = char.codePointAt(0);

      if (code === 10) {
        return "\\n";
      }

      if (code === 13) {
        return "\\r";
      }

      if (code === 9) {
        return "\\t";
      }

      return code < 32 || code === 127 || (code >= 128 && code <= 159)
        ? `\\x${code.toString(16).padStart(2, "0")}`
        : char;
    })
    .join("");
}

export function isInside(root, path) {
  const offset = relative(root, path);

  return (
    offset !== "" &&
    offset !== ".." &&
    !offset.startsWith(`..${sep}`) &&
    !isAbsolute(offset)
  );
}
