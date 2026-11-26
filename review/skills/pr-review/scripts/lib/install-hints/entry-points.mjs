import {
  DOCS_FILES,
  DOCS_HEADING,
  INSTALL_LIKE,
  JUST_FILES,
  MAKE_FILES,
  SCRIPT_FILES,
  TASK_FILES,
} from "./constants.mjs";
import { splitLines, uniqueSorted } from "./text.mjs";

function makeTargets(text) {
  const names = [];

  for (const line of splitLines(text)) {
    const match = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*::?(?![:=])/.exec(line);

    if (match !== null) {
      names.push(match[1]);
    }
  }

  return names;
}

function justRecipes(text) {
  const names = [];

  for (const line of splitLines(text)) {
    const match = /^@?([A-Za-z_][A-Za-z0-9_-]*)(?:\s[^:=]*)?:(?!=)/.exec(line);

    if (match !== null) {
      names.push(match[1]);
    }
  }

  return names;
}

function taskNames(text) {
  const names = [];
  let inTasks = false;

  for (const line of splitLines(text)) {
    if (/^tasks:\s*(#.*)?$/.test(line)) {
      inTasks = true;
    } else if (/^\S/.test(line)) {
      inTasks = false;
    }

    const match = inTasks ? /^ {2}([^\s:#][^:]*?):/.exec(line) : null;

    if (match !== null) {
      names.push(match[1]);
    }
  }

  return names;
}

function headingText(line) {
  let start = 0;

  while (start < 3 && line[start] === " ") {
    start += 1;
  }

  let end = start;

  while (line[end] === "#") {
    end += 1;
  }

  if (end === start || end - start > 6 || !/\s/.test(line.charAt(end))) {
    return "";
  }

  const text = line.slice(end).trim();
  let close = text.length;

  while (close > 0 && text[close - 1] === "#") {
    close -= 1;
  }

  const hasClosing =
    close < text.length && close > 0 && /\s/.test(text[close - 1]);

  return hasClosing ? text.slice(0, close).trim() : text;
}

function docsHeadings(text) {
  const names = [];
  let inFence = false;

  for (const line of splitLines(text)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    }

    const heading = inFence ? "" : headingText(line);

    if (heading && DOCS_HEADING.test(heading)) {
      names.push(heading);
    }
  }

  return names;
}

function findTaskEntries(src) {
  const entries = [];
  const kinds = [
    [MAKE_FILES, "make", makeTargets],
    [JUST_FILES, "just", justRecipes],
    [TASK_FILES, "task", taskNames],
  ];

  for (const [files, kind, extract] of kinds) {
    for (const path of files.filter((file) => src.has(file))) {
      const names = uniqueSorted(
        extract(src.read(path) ?? "").filter((name) => INSTALL_LIKE.test(name)),
      );

      if (names.length > 0) {
        entries.push({ path, kind, names });
      }
    }
  }

  return entries;
}

function findFileEntries(src) {
  const entries = [];

  for (const path of SCRIPT_FILES.filter((file) => src.has(file))) {
    if (src.admit(path)) {
      entries.push({ path, kind: "script-file", names: [] });
    }
  }

  for (const path of DOCS_FILES.filter((file) => src.has(file))) {
    const names = uniqueSorted(docsHeadings(src.read(path) ?? ""));

    if (names.length > 0) {
      entries.push({ path, kind: "docs-section", names });
    }
  }

  return entries;
}

export function findRootEntries(src) {
  return [...findTaskEntries(src), ...findFileEntries(src)];
}
