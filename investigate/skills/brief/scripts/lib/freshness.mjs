import path from "node:path";
import { run } from "./exec.mjs";

const BLOCK_LINES = 10;

function blocksFor(stdout, repoName) {
  const lines = stdout.split("\n");
  const blocks = [];
  lines.forEach((l, idx) => {
    if (l.trim() === repoName) {
      blocks.push(lines.slice(idx, idx + BLOCK_LINES).join("\n"));
    }
  });
  return blocks;
}

function pathOf(block) {
  return block.match(/Path:\s+(\S+)/)?.[1] ?? null;
}

// Two clones can share a repo name, so take the block whose Path is this root.
function pickBlock(blocks, repoRoot) {
  return blocks.find((b) => {
    const p = pathOf(b);
    return p === null || path.resolve(p) === path.resolve(repoRoot);
  });
}

export function parseGitnexusList(stdout, repoName, repoRoot) {
  const blocks = blocksFor(stdout, repoName);
  if (blocks.length === 0) {
    return {
      ok: false,
      note: `repo "${repoName}" is not in the gitnexus registry`,
    };
  }
  const block = pickBlock(blocks, repoRoot);
  if (block === undefined) {
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
  const res = run("git", args, { cwd: ctx.repoRoot, env: ctx.env });
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
