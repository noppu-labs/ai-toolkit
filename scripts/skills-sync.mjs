#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
/**
 * Zero-dependency sync tool for vendored skills.
 * Tracks each skill's upstream source in <plugin>/skills-lock.json and classifies
 * sync state from two whole-directory hashes (vendored copy vs upstream).
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PLUGINS = ["laravel", "inertia-react"];

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full, base));
    } else if (entry.isFile()) {
      out.push(relative(base, full).replaceAll("\\", "/"));
    }
  }
  return out.sort();
}

export function hashFiles(files) {
  const lines = [...files.keys()]
    .sort()
    .map((path) => `${path}:${sha256(files.get(path))}`);
  return sha256(lines.join("\n"));
}

export function hashDirectory(dir) {
  const files = new Map();
  for (const rel of listFiles(dir)) {
    files.set(rel, readFileSync(join(dir, rel)));
  }
  return hashFiles(files);
}

export function classify(entry, vendoredHashNow, upstreamHashNow) {
  if (entry.sourceType === "local") {
    return "local";
  }
  const localChanged = vendoredHashNow !== entry.vendoredHash;
  const upstreamChanged = upstreamHashNow !== entry.upstreamHash;
  if (localChanged && upstreamChanged) {
    return "diverged";
  }
  if (upstreamChanged) {
    return "upstream-updated";
  }
  if (localChanged) {
    return "locally-modified";
  }
  return "up-to-date";
}

export function readLock(root, plugin) {
  return JSON.parse(
    readFileSync(join(root, plugin, "skills-lock.json"), "utf8"),
  );
}

export function writeLock(root, plugin, lock) {
  writeFileSync(
    join(root, plugin, "skills-lock.json"),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
}

function unlockedDirProblems(root, plugin, lock) {
  return readdirSync(join(root, plugin, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !lock.skills[entry.name])
    .map(
      (entry) =>
        `${plugin}/${entry.name}: on disk but missing from skills-lock.json`,
    );
}

function lockEntryProblem(root, plugin, name, entry) {
  const dir = join(root, plugin, "skills", name);
  if (!existsSync(dir)) {
    return `${plugin}/${name}: in skills-lock.json but missing on disk`;
  }
  if (entry.vendoredHash && hashDirectory(dir) !== entry.vendoredHash) {
    return `${plugin}/${name}: content changed since last baseline (run accept or seed)`;
  }
  if (!entry.vendoredHash && entry.sourceType === "github") {
    return `${plugin}/${name}: missing vendoredHash baseline (run seed)`;
  }
  return null;
}

export function verifyAll(root) {
  return PLUGINS.flatMap((plugin) => {
    const lock = readLock(root, plugin);
    const entryProblems = Object.entries(lock.skills).map(([name, entry]) =>
      lockEntryProblem(root, plugin, name, entry),
    );
    return [
      ...unlockedDirProblems(root, plugin, lock),
      ...entryProblems,
    ].filter(Boolean);
  });
}

export function ghJson(path) {
  const stdout = execFileSync("gh", ["api", path], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

export function fetchUpstream(entry, gh = ghJson) {
  const commit = gh(`repos/${entry.source}/commits/${entry.ref}`).sha;
  const files = new Map();
  const walk = (path) => {
    for (const item of gh(
      `repos/${entry.source}/contents/${path}?ref=${commit}`,
    )) {
      if (item.type === "dir") {
        walk(item.path);
      } else if (item.type === "file") {
        const blob = gh(`repos/${entry.source}/git/blobs/${item.sha}`);
        files.set(
          item.path.slice(entry.skillPath.length + 1),
          Buffer.from(blob.content, "base64"),
        );
      }
    }
  };
  walk(entry.skillPath);
  if (files.size === 0) {
    throw new Error(
      `no files under ${entry.skillPath} in ${entry.source}@${entry.ref}`,
    );
  }
  return { commit, files, hash: hashFiles(files) };
}

function requireEntry(root, plugin, name) {
  const lock = readLock(root, plugin);
  const entry = lock.skills[name];
  if (!entry) {
    throw new Error(`${plugin}/${name} not in skills-lock.json`);
  }
  return { lock, entry };
}

export function statusAll(root, fetcher = fetchUpstream) {
  const rows = [];
  for (const plugin of PLUGINS) {
    const lock = readLock(root, plugin);
    for (const [name, entry] of Object.entries(lock.skills)) {
      const id = `${plugin}/${name}`;
      if (entry.sourceType === "local") {
        rows.push({ id, state: "local" });
        continue;
      }
      try {
        const vendored = hashDirectory(join(root, plugin, "skills", name));
        rows.push({
          id,
          state: classify(entry, vendored, fetcher(entry).hash),
        });
      } catch (error) {
        rows.push({
          id,
          state: `fetch-error (${String(error.message).trim()})`,
        });
      }
    }
  }
  return rows;
}

function writeUpstreamTo(dir, files) {
  for (const [rel, buf] of files) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), buf);
  }
}

export function pullSkill(
  root,
  plugin,
  name,
  { force = false, fetcher = fetchUpstream } = {},
) {
  const { lock, entry } = requireEntry(root, plugin, name);
  if (entry.sourceType !== "github") {
    throw new Error(
      `${plugin}/${name} has no github upstream; nothing to pull`,
    );
  }
  const dir = join(root, plugin, "skills", name);
  const upstream = fetcher(entry);
  const state = classify(entry, hashDirectory(dir), upstream.hash);
  if ((state === "locally-modified" || state === "diverged") && !force) {
    throw new Error(
      `${plugin}/${name} is ${state}; run diff and merge manually, or pass --force to overwrite local changes`,
    );
  }
  rmSync(dir, { recursive: true });
  writeUpstreamTo(dir, upstream.files);
  entry.upstreamCommit = upstream.commit;
  entry.upstreamHash = upstream.hash;
  entry.vendoredHash = hashDirectory(dir);
  writeLock(root, plugin, lock);
  return state;
}

export function acceptSkill(root, plugin, name) {
  const { lock, entry } = requireEntry(root, plugin, name);
  entry.vendoredHash = hashDirectory(join(root, plugin, "skills", name));
  writeLock(root, plugin, lock);
}

export function seedSkill(root, plugin, name, fetcher = fetchUpstream) {
  const { lock, entry } = requireEntry(root, plugin, name);
  entry.vendoredHash = hashDirectory(join(root, plugin, "skills", name));
  if (entry.sourceType === "github") {
    const upstream = fetcher(entry);
    entry.upstreamCommit = upstream.commit;
    entry.upstreamHash = upstream.hash;
  }
  writeLock(root, plugin, lock);
  return {
    customized:
      entry.sourceType === "github" &&
      entry.vendoredHash !== entry.upstreamHash,
  };
}

export function diffSkill(root, plugin, name, fetcher = fetchUpstream) {
  const { entry } = requireEntry(root, plugin, name);
  if (entry.sourceType !== "github") {
    throw new Error(
      `${plugin}/${name} has no github upstream; nothing to diff`,
    );
  }
  const tmp = mkdtempSync(join(tmpdir(), "skills-sync-"));
  try {
    writeUpstreamTo(tmp, fetcher(entry).files);
    const result = spawnSync(
      "git",
      ["diff", "--no-index", join(root, plugin, "skills", name), tmp],
      { stdio: "inherit" },
    );
    if (result.error) {
      throw result.error;
    }
    return result.status ?? 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function parseSkillArg(arg) {
  const [plugin, ...rest] = (arg ?? "").split("/");
  const name = rest.join("/");
  if (!PLUGINS.includes(plugin) || !name) {
    throw new Error(
      `expected <plugin>/<skill> with plugin one of: ${PLUGINS.join(", ")}`,
    );
  }
  return { plugin, name };
}

function runStatus(root) {
  for (const row of statusAll(root)) {
    console.log(`${row.state.padEnd(20)} ${row.id}`);
  }
}

function runVerify(root) {
  const problems = verifyAll(root);
  for (const problem of problems) {
    console.error(problem);
  }
  if (problems.length > 0) {
    process.exit(1);
  }
  console.log("skills-lock.json and skills/ are consistent");
}

function runDiff(root, target) {
  const { plugin, name } = parseSkillArg(target);
  process.exit(diffSkill(root, plugin, name));
}

function runPull(root, target, flag) {
  const { plugin, name } = parseSkillArg(target);
  const state = pullSkill(root, plugin, name, { force: flag === "--force" });
  console.log(`pulled ${target} (was ${state})`);
}

function runAccept(root, target) {
  const { plugin, name } = parseSkillArg(target);
  acceptSkill(root, plugin, name);
  console.log(`re-baselined vendoredHash for ${target}`);
}

function reportSeed(target, { customized }) {
  console.log(`seeded ${target}`);
  if (customized) {
    console.warn(
      `  warning: ${target} vendored content differs from upstream at this baseline.\n` +
        `  If that is not a deliberate customization, run: pull ${target}`,
    );
  }
}

function runSeed(root, target) {
  if (!target) {
    for (const plugin of PLUGINS) {
      for (const name of Object.keys(readLock(root, plugin).skills)) {
        reportSeed(`${plugin}/${name}`, seedSkill(root, plugin, name));
      }
    }
    return;
  }
  const { plugin, name } = parseSkillArg(target);
  reportSeed(target, seedSkill(root, plugin, name));
}

const COMMANDS = {
  status: runStatus,
  verify: runVerify,
  diff: runDiff,
  pull: runPull,
  accept: runAccept,
  seed: runSeed,
};

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const [command, target, flag] = process.argv.slice(2);
  if (!Object.hasOwn(COMMANDS, command ?? "")) {
    console.error(
      "usage: skills-sync.mjs <status|verify|diff|pull|accept|seed> [<plugin>/<skill>] [--force]",
    );
    process.exit(2);
  }
  try {
    COMMANDS[command](root, target, flag);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
