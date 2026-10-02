import { existsSync } from "node:fs";
import path from "node:path";
import { run } from "./exec.mjs";

const CODEGRAPH_CAP = 80;

const isObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const objects = (v) => (Array.isArray(v) ? v.filter(isObject) : []);

// Only `status` is guaranteed; every other field is shaped here so one
// malformed symbol cannot throw while the brief renders.
function toGraphContext(parsed) {
  const incoming = isObject(parsed.incoming) ? parsed.incoming : {};
  return {
    ...parsed,
    symbol: isObject(parsed.symbol) ? parsed.symbol : null,
    boundaries: Array.isArray(parsed.boundaries)
      ? parsed.boundaries.filter((b) => typeof b === "string")
      : [],
    incoming: {
      calls: objects(incoming.calls),
      imports: objects(incoming.imports),
    },
    processes: Array.isArray(parsed.processes)
      ? parsed.processes.filter((p) => typeof p === "string" || isObject(p))
      : [],
    epistemic: typeof parsed.epistemic === "string" ? parsed.epistemic : "",
  };
}

export function parseGraphContext(stdout) {
  if (!stdout) return null;
  try {
    const parsed = JSON.parse(stdout);
    return isObject(parsed) && parsed.status === "found"
      ? toGraphContext(parsed)
      : null;
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
