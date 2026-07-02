#!/usr/bin/env node
/**
 * Zero-dependency sync tool for vendored skills.
 * Tracks each skill's upstream source in <plugin>/skills-lock.json and classifies
 * sync state from two whole-directory hashes (vendored copy vs upstream).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PLUGINS = ['laravel', 'inertia-react'];

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full, base));
    } else if (entry.isFile()) {
      out.push(relative(base, full).replaceAll('\\', '/'));
    }
  }
  return out.sort();
}

export function hashFiles(files) {
  const lines = [...files.keys()].sort().map((path) => `${path}:${sha256(files.get(path))}`);
  return sha256(lines.join('\n'));
}

export function hashDirectory(dir) {
  const files = new Map();
  for (const rel of listFiles(dir)) {
    files.set(rel, readFileSync(join(dir, rel)));
  }
  return hashFiles(files);
}

export function classify(entry, vendoredHashNow, upstreamHashNow) {
  if (entry.sourceType === 'local') {
    return 'local';
  }
  const localChanged = vendoredHashNow !== entry.vendoredHash;
  const upstreamChanged = upstreamHashNow !== entry.upstreamHash;
  if (localChanged && upstreamChanged) {
    return 'diverged';
  }
  if (upstreamChanged) {
    return 'upstream-updated';
  }
  if (localChanged) {
    return 'locally-modified';
  }
  return 'up-to-date';
}

export function readLock(root, plugin) {
  return JSON.parse(readFileSync(join(root, plugin, 'skills-lock.json'), 'utf8'));
}

export function writeLock(root, plugin, lock) {
  writeFileSync(join(root, plugin, 'skills-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
}

export function verifyAll(root) {
  const problems = [];
  for (const plugin of PLUGINS) {
    const lock = readLock(root, plugin);
    const skillsDir = join(root, plugin, 'skills');
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !lock.skills[entry.name]) {
        problems.push(`${plugin}/${entry.name}: on disk but missing from skills-lock.json`);
      }
    }
    for (const [name, entry] of Object.entries(lock.skills)) {
      const dir = join(skillsDir, name);
      if (!existsSync(dir)) {
        problems.push(`${plugin}/${name}: in skills-lock.json but missing on disk`);
        continue;
      }
      if (entry.vendoredHash && hashDirectory(dir) !== entry.vendoredHash) {
        problems.push(`${plugin}/${name}: content changed since last baseline (run accept or seed)`);
      } else if (!entry.vendoredHash && entry.sourceType === 'github') {
        problems.push(`${plugin}/${name}: missing vendoredHash baseline (run seed)`);
      }
    }
  }
  return problems;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const [command] = process.argv.slice(2);
  switch (command) {
    case 'verify': {
      const problems = verifyAll(root);
      for (const problem of problems) {
        console.error(problem);
      }
      if (problems.length > 0) {
        process.exit(1);
      }
      console.log('skills-lock.json and skills/ are consistent');
      break;
    }
    default:
      console.error('usage: skills-sync.mjs <status|verify|diff|pull|accept|seed> [<plugin>/<skill>] [--force]');
      process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
