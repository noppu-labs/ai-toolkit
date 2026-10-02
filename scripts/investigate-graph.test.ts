import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Fresh =
  | { ok: true; indexed: string; branch: string }
  | { ok: false; note: string };

type FreshnessModule = {
  parseGitnexusList: (
    stdout: string,
    repoName: string,
    repoRoot: string,
  ) => Fresh;
  indexFreshness: (ctx: {
    repoRoot: string;
    repoName: string;
    env: NodeJS.ProcessEnv;
  }) => Fresh;
};

type GraphModule = {
  parseGraphContext: (stdout: string) => { status: string } | null;
  codegraphOverview: (
    ctx: { repoRoot: string; env: NodeJS.ProcessEnv },
    names: string[],
  ) => string[] | null;
};

const libDir: string = join(
  import.meta.dirname,
  "..",
  "investigate",
  "skills",
  "brief",
  "scripts",
  "lib",
);
const freshness: FreshnessModule = (await import(
  pathToFileURL(join(libDir, "freshness.mjs")).href
)) as FreshnessModule;
const graph: GraphModule = (await import(
  pathToFileURL(join(libDir, "graph.mjs")).href
)) as GraphModule;

const LISTING: string = [
  "Indexed repositories:",
  "",
  "other-repo",
  "  Path:    /tmp/other",
  "  Commit:  deadbeef",
  "  Branch:  main",
  "",
  "my-repo",
  "  Path:    /tmp/my-repo",
  "  Commit:  a474cc5",
  "  Branch:  feat/x",
  "",
].join("\n");

describe("parseGitnexusList", () => {
  it("finds the block for the repo name and returns commit and branch", () => {
    expect(
      freshness.parseGitnexusList(LISTING, "my-repo", "/tmp/my-repo"),
    ).toEqual({
      ok: true,
      indexed: "a474cc5",
      branch: "feat/x",
    });
  });

  it("rejects an entry whose path points elsewhere", () => {
    const r = freshness.parseGitnexusList(LISTING, "my-repo", "/tmp/elsewhere");
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({
      note: expect.stringContaining("points at /tmp/my-repo"),
    });
  });

  it("reports a missing repo and a missing commit", () => {
    expect(freshness.parseGitnexusList(LISTING, "nope", "/x")).toMatchObject({
      ok: false,
      note: expect.stringContaining("not in the gitnexus registry"),
    });
    expect(
      freshness.parseGitnexusList(
        "my-repo\n  Path: /tmp/my-repo\n",
        "my-repo",
        "/tmp/my-repo",
      ),
    ).toMatchObject({
      ok: false,
      note: expect.stringContaining("could not parse"),
    });
  });
});

describe("indexFreshness", () => {
  it("degrades to ok:false when gitnexus is not on PATH", () => {
    const r = freshness.indexFreshness({
      repoRoot: "/tmp",
      repoName: "tmp",
      env: { PATH: "/nonexistent" },
    });
    expect(r.ok).toBe(false);
  });
});

describe("parseGraphContext", () => {
  it("returns parsed JSON only when status is found", () => {
    expect(
      graph.parseGraphContext('{"status":"found","symbol":{}}'),
    ).toMatchObject({
      status: "found",
    });
    expect(graph.parseGraphContext('{"status":"missing"}')).toBeNull();
    expect(graph.parseGraphContext("not json")).toBeNull();
    expect(graph.parseGraphContext("")).toBeNull();
  });
});

describe("codegraphOverview", () => {
  it("returns null when the repo has no .codegraph directory", () => {
    const root = mkdtempSync(join(tmpdir(), "investigate-cg-"));
    expect(
      graph.codegraphOverview({ repoRoot: root, env: process.env }, ["Foo"]),
    ).toBeNull();
  });
});
