import { pathIn } from "../paths.mjs";
import { sortBy } from "../sort.mjs";
import { splitLines } from "./text.mjs";

function toolVersions(text) {
  const found = [];

  for (const line of splitLines(text)) {
    const hash = line.indexOf("#");
    const body = hash === -1 ? line : line.slice(0, hash);
    const [tool, version] = body.trim().split(/\s+/);

    if (tool && version) {
      found.push({ tool, version });
    }
  }

  return found;
}

function findPinnedRuntimes(src, dir) {
  const found = [];
  const pins = [
    [".nvmrc", "node"],
    [".node-version", "node"],
    [".python-version", "python"],
  ];

  for (const [file, tool] of pins) {
    const version = src.read(pathIn(dir, file))?.trim();

    if (version) {
      found.push({ path: pathIn(dir, file), tool, version });
    }
  }

  const path = pathIn(dir, ".tool-versions");

  for (const entry of toolVersions(src.read(path) ?? "")) {
    found.push({ path, ...entry });
  }

  return found;
}

function findManifestRuntimes(manifests) {
  const found = [];

  for (const { path, kind, json } of manifests) {
    const isComposer = kind === "composer-script";
    const engine = isComposer ? json.require?.php : json.engines?.node;

    if (typeof engine === "string" && engine.trim() !== "") {
      found.push({
        path,
        tool: isComposer ? "php" : "node",
        version: engine.trim(),
      });
    }
  }

  return found;
}

export function findRuntimes(src, dirs, manifests) {
  const found = [
    ...dirs.flatMap((dir) => findPinnedRuntimes(src, dir)),
    ...findManifestRuntimes(manifests),
  ];

  return sortBy(found, "path", "tool", "version");
}
