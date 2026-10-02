import { existsSync } from "node:fs";
import path from "node:path";
import { run } from "./exec.mjs";

const CODEGRAPH_CAP = 80;

export function parseGraphContext(stdout) {
  if (!stdout) return null;
  try {
    const parsed = JSON.parse(stdout);
    return parsed && parsed.status === "found" ? parsed : null;
  } catch {
    return null;
  }
}

export function graphContext(ctx, symbolName) {
  const res = run("gitnexus", ["context", symbolName, "--repo", ctx.repoName], {
    cwd: ctx.repoRoot,
    env: ctx.env,
    timeout: 10_000,
  });
  if (res.error || res.status !== 0) return null;
  return parseGraphContext(res.stdout);
}

export function codegraphOverview(ctx, symNames) {
  if (!existsSync(path.join(ctx.repoRoot, ".codegraph"))) return null;
  const res = run(
    "codegraph",
    [
      "explore",
      "--max-files",
      "0",
      "--no-color",
      ...symNames,
      "callers and relationships",
    ],
    { cwd: ctx.repoRoot, env: ctx.env, timeout: 20_000 },
  );
  if (res.error || res.status !== 0 || !res.stdout) return null;
  const lines = res.stdout.split("\n");
  if (lines.length <= CODEGRAPH_CAP) return lines;
  return [
    ...lines.slice(0, CODEGRAPH_CAP),
    `… truncated (${lines.length - CODEGRAPH_CAP} more lines; run codegraph explore for full output)`,
  ];
}
