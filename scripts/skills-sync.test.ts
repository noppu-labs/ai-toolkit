import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { it, type TestContext } from "vitest";
import {
  acceptSkill,
  classify,
  diffSkill,
  fetchUpstream,
  hashDirectory,
  hashFiles,
  type LockEntry,
  type LockFile,
  listFiles,
  PLUGINS,
  pullSkill,
  readLock,
  seedSkill,
  sha256,
  statusAll,
  type UpstreamSnapshot,
  type UpstreamSource,
  verifyAll,
  writeLock,
} from "./skills-sync.ts";

function makeRoot(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "ai-toolkit-test-"));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  for (const plugin of PLUGINS) {
    mkdirSync(join(root, plugin, "skills"), { recursive: true });
    writeLock(root, plugin, { version: 1, skills: {} });
  }
  return root;
}

function addSkill(
  root: string,
  plugin: string,
  name: string,
  files: Record<string, string>,
  entry: LockEntry = { sourceType: "local" },
): string {
  const dir = join(root, plugin, "skills", name);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  const lock = readLock(root, plugin);
  lock.skills[name] = entry;
  writeLock(root, plugin, lock);
  return dir;
}

it("sha256 hashes strings and buffers identically", () => {
  assert.equal(sha256("abc"), sha256(Buffer.from("abc")));
  assert.match(sha256("abc"), /^[0-9a-f]{64}$/);
});

it("listFiles returns sorted relative paths including nested files", (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, "laravel", "demo", {
    "SKILL.md": "# demo",
    "references/b.md": "b",
    "references/a.md": "a",
  });
  assert.deepEqual(listFiles(dir), [
    "SKILL.md",
    "references/a.md",
    "references/b.md",
  ]);
});

it("hashFiles is insertion-order independent and content sensitive", () => {
  const a = new Map([
    ["x.md", Buffer.from("one")],
    ["y.md", Buffer.from("two")],
  ]);
  const b = new Map([
    ["y.md", Buffer.from("two")],
    ["x.md", Buffer.from("one")],
  ]);
  const c = new Map([
    ["x.md", Buffer.from("CHANGED")],
    ["y.md", Buffer.from("two")],
  ]);
  assert.equal(hashFiles(a), hashFiles(b));
  assert.notEqual(hashFiles(a), hashFiles(c));
});

it("hashFiles is not fooled by newline/colon injection in paths", () => {
  const one = Buffer.from("one");
  const two = Buffer.from("two");
  const honest = new Map([
    ["a", one],
    ["b", two],
  ]);
  // Under the old `path:sha256(content)` serialization, this single file
  // produced the same digest input as the two honest files above.
  const forged = new Map([[`a:${sha256(one)}\nb`, two]]);
  assert.notEqual(hashFiles(honest), hashFiles(forged));
});

it("hashDirectory changes when a file changes or is added", (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" });
  const before = hashDirectory(dir);
  writeFileSync(join(dir, "SKILL.md"), "# demo edited");
  const afterEdit = hashDirectory(dir);
  assert.notEqual(before, afterEdit);
  writeFileSync(join(dir, "references.md"), "new file");
  assert.notEqual(afterEdit, hashDirectory(dir));
});

it("classify covers all five states", () => {
  assert.equal(classify({ sourceType: "local" }, "x", "y"), "local");
  const entry = {
    sourceType: "github",
    vendoredHash: "v1",
    upstreamHash: "u1",
  };
  assert.equal(classify(entry, "v1", "u1"), "up-to-date");
  assert.equal(classify(entry, "v1", "u2"), "upstream-updated");
  assert.equal(classify(entry, "v2", "u1"), "locally-modified");
  assert.equal(classify(entry, "v2", "u2"), "diverged");
});

it("lock round-trips through readLock/writeLock with trailing newline", (t) => {
  const root = makeRoot(t);
  const lock = { version: 1, skills: { demo: { sourceType: "local" } } };
  writeLock(root, "laravel", lock);
  assert.deepEqual(readLock(root, "laravel"), lock);
});

it("verifyAll returns no problems for a consistent tree", (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" });
  const lock = readLock(root, "laravel");
  mustEntry(lock, "demo").vendoredHash = hashDirectory(dir);
  writeLock(root, "laravel", lock);
  assert.deepEqual(verifyAll(root), []);
});

it("verifyAll flags tampered content, unlocked dirs, and missing dirs", (t) => {
  const root = makeRoot(t);
  const dir = addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" });
  const lock = readLock(root, "laravel");
  mustEntry(lock, "demo").vendoredHash = hashDirectory(dir);
  lock.skills.ghost = { sourceType: "local" }; // in lock, not on disk
  writeLock(root, "laravel", lock);
  writeFileSync(join(dir, "SKILL.md"), "# tampered");
  mkdirSync(join(root, "laravel", "skills", "unlocked"));
  writeFileSync(join(root, "laravel", "skills", "unlocked", "SKILL.md"), "x");

  const problems = verifyAll(root);
  assert.equal(problems.length, 3);
  assert.ok(
    problems.some((p) => p.includes("laravel/demo") && p.includes("changed")),
  );
  assert.ok(
    problems.some(
      (p) => p.includes("laravel/ghost") && p.includes("missing on disk"),
    ),
  );
  assert.ok(
    problems.some(
      (p) =>
        p.includes("laravel/unlocked") &&
        p.includes("missing from skills-lock.json"),
    ),
  );
});

it("verifyAll flags github entries without a vendoredHash baseline", (t) => {
  const root = makeRoot(t);
  addSkill(
    root,
    "laravel",
    "demo",
    { "SKILL.md": "# demo" },
    {
      source: "owner/repo",
      sourceType: "github",
      ref: "main",
      skillPath: "skills/demo",
    },
  );
  const problems = verifyAll(root);
  assert.equal(problems.length, 1);
  assert.ok(problems[0]?.includes("missing vendoredHash"));
});

function mustEntry(lock: LockFile, name: string): LockEntry {
  const entry = lock.skills[name];
  if (!entry) {
    throw new Error(`${name} missing from lock`);
  }
  return entry;
}

function fakeFetcher(
  files: Record<string, string>,
  commit = "cafe1234",
): () => UpstreamSnapshot {
  const map = new Map<string, Buffer>(
    Object.entries(files).map(([k, v]) => [k, Buffer.from(v)]),
  );
  return () => ({ commit, files: map, hash: hashFiles(map) });
}

function githubEntry(
  overrides: Pick<
    LockEntry,
    "vendoredHash" | "upstreamHash" | "upstreamCommit"
  > = {},
): LockEntry & UpstreamSource {
  return {
    source: "owner/repo",
    sourceType: "github",
    ref: "main",
    skillPath: "skills/demo",
    ...overrides,
  };
}

it("statusAll classifies via the injected fetcher and reports fetch errors", (t) => {
  const root = makeRoot(t);
  const dir = addSkill(
    root,
    "laravel",
    "demo",
    { "SKILL.md": "# demo" },
    githubEntry(),
  );
  const lock = readLock(root, "laravel");
  const upstream = fakeFetcher({ "SKILL.md": "# demo" })();
  const demo = mustEntry(lock, "demo");
  demo.vendoredHash = hashDirectory(dir);
  demo.upstreamHash = upstream.hash;
  lock.skills.other = { sourceType: "local" };
  writeLock(root, "laravel", lock);
  addSkill(root, "laravel", "other", { "SKILL.md": "x" });

  const rows = statusAll(root, () => upstream);
  assert.deepEqual(
    rows.find((r) => r.id === "laravel/demo"),
    { id: "laravel/demo", state: "up-to-date" },
  );
  assert.deepEqual(
    rows.find((r) => r.id === "laravel/other"),
    { id: "laravel/other", state: "local" },
  );

  const failing = statusAll(root, () => {
    throw new Error("boom");
  });
  assert.ok(
    failing
      .find((r) => r.id === "laravel/demo")
      ?.state.startsWith("fetch-error"),
  );
});

it("statusAll reports fetch-error for a missing skill directory without aborting the run", (t) => {
  const root = makeRoot(t);
  const dir = addSkill(
    root,
    "laravel",
    "demo",
    { "SKILL.md": "# demo" },
    githubEntry(),
  );
  const lock = readLock(root, "laravel");
  const upstream = fakeFetcher({ "SKILL.md": "# demo" })();
  const demo = mustEntry(lock, "demo");
  demo.vendoredHash = hashDirectory(dir);
  demo.upstreamHash = upstream.hash;
  lock.skills.ghost = githubEntry(); // in lock, but no skill directory on disk
  writeLock(root, "laravel", lock);

  const rows = statusAll(root, () => upstream);
  assert.deepEqual(
    rows.find((r) => r.id === "laravel/demo"),
    { id: "laravel/demo", state: "up-to-date" },
  );
  const ghostRow = rows.find((r) => r.id === "laravel/ghost");
  assert.ok(ghostRow?.state.startsWith("fetch-error"));
});

it("diffSkill throws when the underlying spawnSync call fails (e.g. git missing from PATH)", (t) => {
  const root = makeRoot(t);
  addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" }, githubEntry());
  const emptyPathDir = mkdtempSync(join(tmpdir(), "empty-path-"));
  const originalPath = process.env.PATH;
  t.onTestFinished(() => {
    process.env.PATH = originalPath;
    rmSync(emptyPathDir, { recursive: true, force: true });
  });
  process.env.PATH = emptyPathDir;

  assert.throws(
    () =>
      diffSkill(root, "laravel", "demo", fakeFetcher({ "SKILL.md": "# demo" })),
    /ENOENT/,
  );
});

it("pullSkill refuses to overwrite local changes without force, then overwrites with force", (t) => {
  const root = makeRoot(t);
  const dir = addSkill(
    root,
    "laravel",
    "demo",
    { "SKILL.md": "# local edit" },
    githubEntry({
      vendoredHash: "stale-baseline",
      upstreamHash: "stale-upstream",
    }),
  );
  const fetcher = fakeFetcher({
    "SKILL.md": "# upstream v2",
    "references/new.md": "ref",
  });

  assert.throws(
    () => pullSkill(root, "laravel", "demo", { fetcher }),
    /diverged/,
  );

  const state = pullSkill(root, "laravel", "demo", { fetcher, force: true });
  assert.equal(state, "diverged");
  assert.equal(readFileSync(join(dir, "SKILL.md"), "utf8"), "# upstream v2");
  assert.equal(readFileSync(join(dir, "references/new.md"), "utf8"), "ref");
  const entry = mustEntry(readLock(root, "laravel"), "demo");
  assert.equal(entry.upstreamCommit, "cafe1234");
  assert.equal(entry.upstreamHash, fetcher().hash);
  assert.equal(entry.vendoredHash, hashDirectory(dir));
});

it("pullSkill fast-forwards an upstream-updated skill", (t) => {
  const root = makeRoot(t);
  const dir = addSkill(
    root,
    "laravel",
    "demo",
    { "SKILL.md": "# v1" },
    githubEntry(),
  );
  const lock = readLock(root, "laravel");
  const demo = mustEntry(lock, "demo");
  demo.vendoredHash = hashDirectory(dir);
  demo.upstreamHash = fakeFetcher({ "SKILL.md": "# v1" })().hash;
  writeLock(root, "laravel", lock);

  const state = pullSkill(root, "laravel", "demo", {
    fetcher: fakeFetcher({ "SKILL.md": "# v2" }),
  });
  assert.equal(state, "upstream-updated");
  assert.equal(readFileSync(join(dir, "SKILL.md"), "utf8"), "# v2");
});

it("acceptSkill re-baselines only vendoredHash", (t) => {
  const root = makeRoot(t);
  const dir = addSkill(
    root,
    "laravel",
    "demo",
    { "SKILL.md": "# edited" },
    githubEntry({
      vendoredHash: "old",
      upstreamHash: "u1",
      upstreamCommit: "c1",
    }),
  );
  acceptSkill(root, "laravel", "demo");
  const entry = mustEntry(readLock(root, "laravel"), "demo");
  assert.equal(entry.vendoredHash, hashDirectory(dir));
  assert.equal(entry.upstreamHash, "u1");
  assert.equal(entry.upstreamCommit, "c1");
});

it("seedSkill baselines local skills offline and github skills via fetcher", (t) => {
  const root = makeRoot(t);
  const localDir = addSkill(root, "laravel", "custom", {
    "SKILL.md": "# custom",
  });
  seedSkill(root, "laravel", "custom");
  assert.equal(
    mustEntry(readLock(root, "laravel"), "custom").vendoredHash,
    hashDirectory(localDir),
  );

  const ghDir = addSkill(
    root,
    "laravel",
    "demo",
    { "SKILL.md": "# demo" },
    githubEntry(),
  );
  const fetcher = fakeFetcher({ "SKILL.md": "# upstream" }, "feed5678");
  seedSkill(root, "laravel", "demo", fetcher);
  const entry = mustEntry(readLock(root, "laravel"), "demo");
  assert.equal(entry.vendoredHash, hashDirectory(ghDir));
  assert.equal(entry.upstreamCommit, "feed5678");
  assert.equal(entry.upstreamHash, fetcher().hash);
});

it("fetchUpstream walks directories via the gh contents API", () => {
  const b64 = (s: string): string => Buffer.from(s).toString("base64");
  const responses: Record<string, unknown> = {
    "repos/owner/repo/commits/main": { sha: "abc999" },
    "repos/owner/repo/contents/skills/demo?ref=abc999": [
      { type: "file", path: "skills/demo/SKILL.md", sha: "blob1" },
      { type: "dir", path: "skills/demo/references" },
    ],
    "repos/owner/repo/contents/skills/demo/references?ref=abc999": [
      { type: "file", path: "skills/demo/references/a.md", sha: "blob2" },
    ],
    "repos/owner/repo/git/blobs/blob1": { content: b64("# demo") },
    "repos/owner/repo/git/blobs/blob2": { content: b64("ref a") },
  };
  const gh = (path: string): unknown => {
    if (!(path in responses)) throw new Error(`unexpected gh call: ${path}`);
    return responses[path];
  };
  const result = fetchUpstream(githubEntry(), gh);
  assert.equal(result.commit, "abc999");
  assert.deepEqual([...result.files.keys()].sort(), [
    "SKILL.md",
    "references/a.md",
  ]);
  assert.equal(result.files.get("SKILL.md")?.toString(), "# demo");
  assert.equal(result.hash, hashFiles(result.files));
});
