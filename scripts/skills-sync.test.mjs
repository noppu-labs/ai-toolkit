import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  acceptSkill,
  PLUGINS,
  classify,
  fetchUpstream,
  hashDirectory,
  hashFiles,
  listFiles,
  pullSkill,
  readLock,
  seedSkill,
  sha256,
  statusAll,
  verifyAll,
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

test('verifyAll returns no problems for a consistent tree', (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, 'laravel', 'demo', { 'SKILL.md': '# demo' });
  const lock = readLock(root, 'laravel');
  lock.skills.demo.vendoredHash = hashDirectory(dir);
  writeLock(root, 'laravel', lock);
  assert.deepEqual(verifyAll(root), []);
});

test('verifyAll flags tampered content, unlocked dirs, and missing dirs', (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, 'laravel', 'demo', { 'SKILL.md': '# demo' });
  const lock = readLock(root, 'laravel');
  lock.skills.demo.vendoredHash = hashDirectory(dir);
  lock.skills.ghost = { sourceType: 'local' }; // in lock, not on disk
  writeLock(root, 'laravel', lock);
  writeFileSync(join(dir, 'SKILL.md'), '# tampered');
  mkdirSync(join(root, 'laravel', 'skills', 'unlocked'));
  writeFileSync(join(root, 'laravel', 'skills', 'unlocked', 'SKILL.md'), 'x');

  const problems = verifyAll(root);
  assert.equal(problems.length, 3);
  assert.ok(problems.some((p) => p.includes('laravel/demo') && p.includes('changed')));
  assert.ok(problems.some((p) => p.includes('laravel/ghost') && p.includes('missing on disk')));
  assert.ok(problems.some((p) => p.includes('laravel/unlocked') && p.includes('missing from skills-lock.json')));
});

test('verifyAll flags github entries without a vendoredHash baseline', (t) => {
  const root = makeRoot(t);
  addSkill(root, 'laravel', 'demo', { 'SKILL.md': '# demo' }, {
    source: 'owner/repo', sourceType: 'github', ref: 'main', skillPath: 'skills/demo',
  });
  const problems = verifyAll(root);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('missing vendoredHash'));
});

function fakeFetcher(files, commit = 'cafe1234') {
  const map = new Map(Object.entries(files).map(([k, v]) => [k, Buffer.from(v)]));
  return () => ({ commit, files: map, hash: hashFiles(map) });
}

function githubEntry(overrides = {}) {
  return {
    source: 'owner/repo', sourceType: 'github', ref: 'main', skillPath: 'skills/demo',
    ...overrides,
  };
}

test('statusAll classifies via the injected fetcher and reports fetch errors', (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, 'laravel', 'demo', { 'SKILL.md': '# demo' }, githubEntry());
  const lock = readLock(root, 'laravel');
  const upstream = fakeFetcher({ 'SKILL.md': '# demo' })();
  lock.skills.demo.vendoredHash = hashDirectory(dir);
  lock.skills.demo.upstreamHash = upstream.hash;
  lock.skills.other = { sourceType: 'local' };
  writeLock(root, 'laravel', lock);
  addSkill(root, 'laravel', 'other', { 'SKILL.md': 'x' });

  const rows = statusAll(root, () => upstream);
  assert.deepEqual(rows.find((r) => r.id === 'laravel/demo'), { id: 'laravel/demo', state: 'up-to-date' });
  assert.deepEqual(rows.find((r) => r.id === 'laravel/other'), { id: 'laravel/other', state: 'local' });

  const failing = statusAll(root, () => { throw new Error('boom'); });
  assert.ok(failing.find((r) => r.id === 'laravel/demo').state.startsWith('fetch-error'));
});

test('pullSkill refuses to overwrite local changes without force, then overwrites with force', (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, 'laravel', 'demo', { 'SKILL.md': '# local edit' }, githubEntry({
    vendoredHash: 'stale-baseline', upstreamHash: 'stale-upstream',
  }));
  const fetcher = fakeFetcher({ 'SKILL.md': '# upstream v2', 'references/new.md': 'ref' });

  assert.throws(() => pullSkill(root, 'laravel', 'demo', { fetcher }), /diverged/);

  const state = pullSkill(root, 'laravel', 'demo', { fetcher, force: true });
  assert.equal(state, 'diverged');
  assert.equal(readFileSync(join(dir, 'SKILL.md'), 'utf8'), '# upstream v2');
  assert.equal(readFileSync(join(dir, 'references/new.md'), 'utf8'), 'ref');
  const entry = readLock(root, 'laravel').skills.demo;
  assert.equal(entry.upstreamCommit, 'cafe1234');
  assert.equal(entry.upstreamHash, fetcher().hash);
  assert.equal(entry.vendoredHash, hashDirectory(dir));
});

test('pullSkill fast-forwards an upstream-updated skill', (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, 'laravel', 'demo', { 'SKILL.md': '# v1' }, githubEntry());
  const lock = readLock(root, 'laravel');
  lock.skills.demo.vendoredHash = hashDirectory(dir);
  lock.skills.demo.upstreamHash = fakeFetcher({ 'SKILL.md': '# v1' })().hash;
  writeLock(root, 'laravel', lock);

  const state = pullSkill(root, 'laravel', 'demo', { fetcher: fakeFetcher({ 'SKILL.md': '# v2' }) });
  assert.equal(state, 'upstream-updated');
  assert.equal(readFileSync(join(dir, 'SKILL.md'), 'utf8'), '# v2');
});

test('acceptSkill re-baselines only vendoredHash', (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, 'laravel', 'demo', { 'SKILL.md': '# edited' }, githubEntry({
    vendoredHash: 'old', upstreamHash: 'u1', upstreamCommit: 'c1',
  }));
  acceptSkill(root, 'laravel', 'demo');
  const entry = readLock(root, 'laravel').skills.demo;
  assert.equal(entry.vendoredHash, hashDirectory(dir));
  assert.equal(entry.upstreamHash, 'u1');
  assert.equal(entry.upstreamCommit, 'c1');
});

test('seedSkill baselines local skills offline and github skills via fetcher', (t) => {
  const root = makeRoot(t);
  const localDir = addSkill(root, 'laravel', 'custom', { 'SKILL.md': '# custom' });
  seedSkill(root, 'laravel', 'custom');
  assert.equal(readLock(root, 'laravel').skills.custom.vendoredHash, hashDirectory(localDir));

  const ghDir = addSkill(root, 'laravel', 'demo', { 'SKILL.md': '# demo' }, githubEntry());
  const fetcher = fakeFetcher({ 'SKILL.md': '# upstream' }, 'feed5678');
  seedSkill(root, 'laravel', 'demo', fetcher);
  const entry = readLock(root, 'laravel').skills.demo;
  assert.equal(entry.vendoredHash, hashDirectory(ghDir));
  assert.equal(entry.upstreamCommit, 'feed5678');
  assert.equal(entry.upstreamHash, fetcher().hash);
});

test('fetchUpstream walks directories via the gh contents API', () => {
  const b64 = (s) => Buffer.from(s).toString('base64');
  const responses = {
    'repos/owner/repo/commits/main': { sha: 'abc999' },
    'repos/owner/repo/contents/skills/demo?ref=abc999': [
      { type: 'file', path: 'skills/demo/SKILL.md', sha: 'blob1' },
      { type: 'dir', path: 'skills/demo/references' },
    ],
    'repos/owner/repo/contents/skills/demo/references?ref=abc999': [
      { type: 'file', path: 'skills/demo/references/a.md', sha: 'blob2' },
    ],
    'repos/owner/repo/git/blobs/blob1': { content: b64('# demo') },
    'repos/owner/repo/git/blobs/blob2': { content: b64('ref a') },
  };
  const gh = (path) => {
    if (!(path in responses)) throw new Error(`unexpected gh call: ${path}`);
    return responses[path];
  };
  const result = fetchUpstream(githubEntry(), gh);
  assert.equal(result.commit, 'abc999');
  assert.deepEqual([...result.files.keys()].sort(), ['SKILL.md', 'references/a.md']);
  assert.equal(result.files.get('SKILL.md').toString(), '# demo');
  assert.equal(result.hash, hashFiles(result.files));
});
