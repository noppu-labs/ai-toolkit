#!/usr/bin/env node
/**
 * Zero-dependency sync tool for vendored skills.
 * Tracks each skill's upstream source in <plugin>/skills-lock.json and classifies
 * sync state from two whole-directory hashes (vendored copy vs upstream).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

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
