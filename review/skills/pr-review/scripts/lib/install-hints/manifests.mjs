import { posix } from "node:path";
import { isSafePath, isVendored } from "../paths.mjs";
import { sortBy } from "../sort.mjs";
import { COMPOSER_HOOKS, INSTALL_LIKE, NPM_HOOKS } from "./constants.mjs";
import { parseJsonObject, uniqueSorted } from "./text.mjs";

function hookCommand(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.every((part) => typeof part === "string")) {
    return value.join(" && ");
  }

  return null;
}

function readManifest(src, path, kind) {
  const text = src.read(path);

  if (text === null) {
    return null;
  }

  const json = parseJsonObject(text);
  const safe = isSafePath(path);

  if (json === null) {
    src.skip(path, "invalid-json");

    return null;
  }

  if (!safe) {
    src.skip(path, "unsafe-path");
  }

  return { path, kind: kind[1], hooks: kind[2], json, safe };
}

export function readManifests(src) {
  const manifests = [];
  const kinds = [
    ["composer.json", "composer-script", COMPOSER_HOOKS],
    ["package.json", "npm-script", NPM_HOOKS],
  ];

  for (const path of src.paths()) {
    const kind = kinds.find(([file]) => posix.basename(path) === file);
    const manifest =
      kind === undefined || isVendored(path)
        ? null
        : readManifest(src, path, kind);

    if (manifest !== null) {
      manifests.push(manifest);
    }
  }

  return manifests;
}

function scriptsOf(json) {
  const scripts = json.scripts;

  return scripts !== null && typeof scripts === "object" ? scripts : {};
}

export function findManifestEntries(manifests) {
  const entries = [];

  for (const { path, kind, hooks, json } of manifests) {
    const names = Object.keys(scriptsOf(json)).filter(
      (name) => INSTALL_LIKE.test(name) && !hooks.includes(name),
    );

    if (names.length > 0) {
      entries.push({ path, kind, names: uniqueSorted(names) });
    }
  }

  return entries;
}

export function findInstallHooks(manifests) {
  const found = [];

  for (const { path, hooks, json } of manifests) {
    const scripts = scriptsOf(json);

    for (const name of hooks) {
      const command = hookCommand(scripts[name]);

      if (command !== null) {
        found.push({ path, name, command });
      }
    }
  }

  return sortBy(found, "path", "name");
}
