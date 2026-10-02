import path from "node:path";
import { run } from "./exec.mjs";

const BLOCK_LINES = 10;

function findBlock(stdout, repoName) {
  const lines = stdout.split("\n");
  const idx = lines.findIndex((l) => l.trim() === repoName);
  return idx === -1 ? null : lines.slice(idx, idx + BLOCK_LINES).join("\n");
}

export function parseGitnexusList(stdout, repoName, repoRoot) {
  const block = findBlock(stdout, repoName);
  if (block === null) {
    return {
      ok: false,
      note: `repo "${repoName}" is not in the gitnexus registry`,
    };
  }
  const pathMatch = block.match(/Path:\s+(\S+)/);
  if (pathMatch && path.resolve(pathMatch[1]) !== path.resolve(repoRoot)) {
    return {
      ok: false,
      note: `registry entry "${repoName}" points at ${pathMatch[1]}, not ${repoRoot}`,
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

export function indexFreshness(ctx) {
  const list = run("gitnexus", ["list"], { cwd: ctx.repoRoot, env: ctx.env });
  if (list.error || list.status !== 0 || !list.stdout) {
    return { ok: false, note: "gitnexus list failed — graph sections omitted" };
  }
  const parsed = parseGitnexusList(list.stdout, ctx.repoName, ctx.repoRoot);
  if (!parsed.ok) return parsed;
  const behind = run(
    "git",
    ["rev-list", "--count", `${parsed.indexed}..HEAD`],
    {
      cwd: ctx.repoRoot,
      env: ctx.env,
    },
  );
  const commitsBehind =
    behind.status === 0 ? Number.parseInt(behind.stdout.trim(), 10) : null;
  return {
    ...parsed,
    commitsBehind,
    stale: commitsBehind === null || commitsBehind > 0,
  };
}
