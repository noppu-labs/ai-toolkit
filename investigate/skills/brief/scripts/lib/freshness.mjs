import { realpathSync } from "node:fs";
import path from "node:path";
import { git, run } from "./exec.mjs";

// A name `gitnexus list` shows twice gets a `  (<path>)` suffix, which is not
// part of the name. String ops, not a regex: `\s+\(.*\)$` backtracks.
function entryName(line) {
  const name = line.trim();
  const suffix = name.indexOf(" (");
  return suffix !== -1 && name.endsWith(")")
    ? name.slice(0, suffix).trimEnd()
    : name;
}

// `gitnexus list` separates entries with a blank line. The separator class
// excludes `\n`, so a run of blank lines cannot backtrack.
function entries(stdout) {
  return stdout
    .split(/\n[ \t\r]*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => ({ block, name: entryName(block.split("\n")[0] ?? "") }));
}

function pathOf(block) {
  return block.match(/Path:\s+(\S+)/)?.[1] ?? null;
}

function realOrResolved(p) {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function samePath(a, b) {
  return realOrResolved(a) === realOrResolved(b);
}

// The Path decides, not the name: a linked worktree is registered under
// whatever --name it was indexed with, never this directory's basename, and
// two clones can share a name. A same-name entry with no Path line still counts.
function pickBlock(all, repoName, repoRoot) {
  const byPath = all.find((e) => {
    const p = pathOf(e.block);
    return p !== null && samePath(p, repoRoot);
  });
  if (byPath) return byPath.block;
  return all.find((e) => e.name === repoName && pathOf(e.block) === null)
    ?.block;
}

export function parseGitnexusList(stdout, repoName, repoRoot) {
  const all = entries(stdout);
  const block = pickBlock(all, repoName, repoRoot);
  const sameName = all.filter((e) => e.name === repoName);
  if (block === undefined && sameName.length === 0) {
    return {
      ok: false,
      note: `repo "${repoName}" (${repoRoot}) is not in the gitnexus registry`,
    };
  }
  if (block === undefined) {
    const blocks = sameName.map((e) => e.block);
    return {
      ok: false,
      note: `registry entry "${repoName}" points at ${pathOf(blocks[0] ?? "")}, not ${repoRoot}`,
    };
  }
  const commitMatch = block.match(/Commit:\s+([0-9a-f]+)/);
  if (!commitMatch) {
    return {
      ok: false,
      note: "could not parse indexed commit from gitnexus list",
    };
  }
  const branchMatch = block.match(/Branch:\s+(\S+)/);
  return {
    ok: true,
    indexed: commitMatch[1],
    branch: branchMatch ? branchMatch[1] : "?",
  };
}

function listFailure(list) {
  if (list.error?.code === "ENOENT") {
    return { ok: false, absent: true, note: "gitnexus not on PATH" };
  }
  if (list.error) {
    return {
      ok: false,
      failed: true,
      note: `gitnexus list failed: ${list.error.message}`,
    };
  }
  if (list.status !== 0) {
    return {
      ok: false,
      failed: true,
      note: `gitnexus list exited ${list.status}`,
    };
  }
  if (!list.stdout) {
    return { ok: false, failed: true, note: "gitnexus list printed nothing" };
  }
  return null;
}

function gitOut(ctx, args) {
  const res = git(args, { cwd: ctx.repoRoot, env: ctx.env });
  return res.status === 0 ? res.stdout.trim() : null;
}

function countOf(ctx, range) {
  const out = gitOut(ctx, ["rev-list", "--count", range]);
  return out === null ? null : Number.parseInt(out, 10);
}

// Current only when the indexed commit is HEAD. An index built on a commit
// HEAD's history lacks is stale whatever <indexed>..HEAD counts.
function staleness(ctx, indexed) {
  const head = gitOut(ctx, ["rev-parse", "HEAD"]);
  const full = gitOut(ctx, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${indexed}^{commit}`,
  ]);
  if (head !== null && full === head) {
    return { stale: false, commitsBehind: 0, divergent: false };
  }
  const behind = countOf(ctx, `${indexed}..HEAD`);
  const ahead = countOf(ctx, `HEAD..${indexed}`);
  if (behind === null || ahead === null || ahead > 0) {
    return { stale: true, commitsBehind: null, divergent: true };
  }
  return { stale: true, commitsBehind: behind, divergent: false };
}

export function indexFreshness(ctx) {
  const list = run("gitnexus", ["list"], { cwd: ctx.repoRoot, env: ctx.env });
  const failure = listFailure(list);
  if (failure) return failure;
  const parsed = parseGitnexusList(list.stdout, ctx.repoName, ctx.repoRoot);
  if (!parsed.ok) return parsed;
  return { ...parsed, ...staleness(ctx, parsed.indexed) };
}
