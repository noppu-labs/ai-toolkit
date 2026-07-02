import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  PLUGINS,
  classify,
  hashDirectory,
  hashFiles,
  listFiles,
  readLock,
  sha256,
  writeLock,
} from './skills-sync.mjs';

function makeRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'ai-toolkit-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const plugin of PLUGINS) {
    mkdirSync(join(root, plugin, 'skills'), { recursive: true });
    writeLock(root, plugin, { version: 1, skills: {} });
  }
  return root;
}

function addSkill(root, plugin, name, files, entry = { sourceType: 'local' }) {
  const dir = join(root, plugin, 'skills', name);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  const lock = readLock(root, plugin);
  lock.skills[name] = entry;
  writeLock(root, plugin, lock);
  return dir;
}

test('sha256 hashes strings and buffers identically', () => {
  assert.equal(sha256('abc'), sha256(Buffer.from('abc')));
  assert.match(sha256('abc'), /^[0-9a-f]{64}$/);
});

test('listFiles returns sorted relative paths including nested files', (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, 'laravel', 'demo', {
    'SKILL.md': '# demo',
    'references/b.md': 'b',
    'references/a.md': 'a',
  });
  assert.deepEqual(listFiles(dir), ['SKILL.md', 'references/a.md', 'references/b.md']);
});

test('hashFiles is insertion-order independent and content sensitive', () => {
  const a = new Map([['x.md', Buffer.from('one')], ['y.md', Buffer.from('two')]]);
  const b = new Map([['y.md', Buffer.from('two')], ['x.md', Buffer.from('one')]]);
  const c = new Map([['x.md', Buffer.from('CHANGED')], ['y.md', Buffer.from('two')]]);
  assert.equal(hashFiles(a), hashFiles(b));
  assert.notEqual(hashFiles(a), hashFiles(c));
});

test('hashDirectory changes when a file changes or is added', (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, 'laravel', 'demo', { 'SKILL.md': '# demo' });
  const before = hashDirectory(dir);
  writeFileSync(join(dir, 'SKILL.md'), '# demo edited');
  const afterEdit = hashDirectory(dir);
  assert.notEqual(before, afterEdit);
  writeFileSync(join(dir, 'references.md'), 'new file');
  assert.notEqual(afterEdit, hashDirectory(dir));
});

test('classify covers all five states', () => {
  assert.equal(classify({ sourceType: 'local' }, 'x', 'y'), 'local');
  const entry = { sourceType: 'github', vendoredHash: 'v1', upstreamHash: 'u1' };
  assert.equal(classify(entry, 'v1', 'u1'), 'up-to-date');
  assert.equal(classify(entry, 'v1', 'u2'), 'upstream-updated');
  assert.equal(classify(entry, 'v2', 'u1'), 'locally-modified');
  assert.equal(classify(entry, 'v2', 'u2'), 'diverged');
});

test('lock round-trips through readLock/writeLock with trailing newline', (t) => {
  const root = makeRoot(t);
  const lock = { version: 1, skills: { demo: { sourceType: 'local' } } };
  writeLock(root, 'laravel', lock);
  assert.deepEqual(readLock(root, 'laravel'), lock);
});
