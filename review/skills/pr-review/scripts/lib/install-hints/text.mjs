import { compare } from "../sort.mjs";

export function splitLines(text) {
  return text.split(/\r?\n/);
}

export function parseJsonObject(text) {
  try {
    const value = JSON.parse(text.startsWith("\uFEFF") ? text.slice(1) : text);

    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function uniqueSorted(names) {
  return [...new Set(names)].sort(compare);
}
