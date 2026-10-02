import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { git } from "./fixtures/investigate-git.ts";
import { makeFakeToolPath, makeNoToolsPath } from "./fixtures/no-tools-path.ts";

type Fresh =
  | {
      ok: true;
      indexed: string;
      branch: string;
      stale?: boolean;
      commitsBehind?: number | null;
      divergent?: boolean;
    }
  | { ok: false; note: string; absent?: boolean; failed?: boolean };

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

type GraphContext = {
  status: string;
  symbol: Record<string, unknown> | null;
  boundaries: string[];
  incoming: { calls: unknown[]; imports: unknown[] };
  processes: unknown[];
  epistemic: string;
};
type GraphModule = {
  parseGraphContext: (stdout: string) => GraphContext | null;
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

const FAKE_GITNEXUS_PATH: string = makeFakeToolPath(
  "gitnexus",
  join(import.meta.dirname, "fixtures", "fake-gitnexus.mjs"),
);
const NO_TOOLS_PATH: string = makeNoToolsPath();
const FAKE_CODEGRAPH_PATH: string = makeFakeToolPath(
  "codegraph",
  join(import.meta.dirname, "fixtures", "fake-codegraph.mjs"),
);

// main has three commits; side branches off the first and adds one of its own.
function makeHistory(): { root: string; shas: string[]; side: string } {
  const root = mkdtempSync(join(tmpdir(), "investigate-fresh-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  const shas: string[] = [];
  for (const n of [1, 2, 3]) {
    writeFileSync(join(root, "f.txt"), `${n}\n`);
    git(root, "add", ".");
    git(root, "commit", "-q", "-m", `c${n}`);
    shas.push(git(root, "rev-parse", "HEAD"));
  }
  git(root, "checkout", "-q", "-b", "side", shas[0] ?? "");
  writeFileSync(join(root, "g.txt"), "side\n");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "side");
  const side = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "-q", "main");
  return { root, shas, side };
}

function listing(name: string, root: string, commit: string): string {
  return `${name}\n  Path:    ${root}\n  Commit:  ${commit}\n  Branch:  main\n`;
}

function freshnessAt(
  root: string,
  commit: string,
  extra: Record<string, string> = {},
): Fresh {
  const repoName = root.split("/").pop() ?? "";
  return freshness.indexFreshness({
    repoRoot: root,
    repoName,
    env: {
      PATH: FAKE_GITNEXUS_PATH,
      HOME: root,
      FAKE_GITNEXUS_LIST: listing(repoName, root, commit),
      ...extra,
    },
  });
}

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

  it("uses the same-name block whose path matches, not just the first", () => {
    const twoClones = [
      "my-repo",
      "  Path:    /tmp/clone-a",
      "  Commit:  1111111",
      "",
      "my-repo",
      "  Path:    /tmp/my-repo",
      "  Commit:  2222222",
      "  Branch:  dev",
      "",
    ].join("\n");
    expect(
      freshness.parseGitnexusList(twoClones, "my-repo", "/tmp/my-repo"),
    ).toEqual({ ok: true, indexed: "2222222", branch: "dev" });
    expect(
      freshness.parseGitnexusList(twoClones, "my-repo", "/tmp/elsewhere"),
    ).toMatchObject({
      ok: false,
      note: expect.stringContaining("points at /tmp/clone-a"),
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
  it("is absent, not failed, when gitnexus is not on PATH", () => {
    const r = freshness.indexFreshness({
      repoRoot: "/tmp",
      repoName: "tmp",
      env: { PATH: NO_TOOLS_PATH },
    });
    expect(r).toEqual({
      ok: false,
      absent: true,
      note: "gitnexus not on PATH",
    });
  });

  it("is failed, with the exit code, when an installed gitnexus list errors", () => {
    const { root, shas } = makeHistory();
    expect(
      freshnessAt(root, shas[2] ?? "", { FAKE_GITNEXUS_EXIT: "2" }),
    ).toEqual({ ok: false, failed: true, note: "gitnexus list exited 2" });
  });

  it("is current only when the indexed commit is HEAD", () => {
    const { root, shas } = makeHistory();
    expect(freshnessAt(root, shas[2] ?? "")).toMatchObject({
      ok: true,
      stale: false,
    });
    expect(freshnessAt(root, (shas[2] ?? "").slice(0, 7))).toMatchObject({
      ok: true,
      stale: false,
    });
  });

  it("counts commits behind when the indexed commit is an ancestor of HEAD", () => {
    const { root, shas } = makeHistory();
    expect(freshnessAt(root, shas[0] ?? "")).toMatchObject({
      ok: true,
      stale: true,
      commitsBehind: 2,
      divergent: false,
    });
  });

  it("is stale and divergent when the indexed commit is not in HEAD's history", () => {
    const { root, side } = makeHistory();
    expect(freshnessAt(root, side)).toMatchObject({
      ok: true,
      stale: true,
      divergent: true,
    });
    expect(freshnessAt(root, "f".repeat(40))).toMatchObject({
      ok: true,
      stale: true,
      divergent: true,
    });
  });

  it("is stale and divergent when HEAD is an ancestor of the indexed commit", () => {
    const { root, shas } = makeHistory();
    git(root, "checkout", "-q", shas[0] ?? "");
    expect(freshnessAt(root, shas[2] ?? "")).toMatchObject({
      ok: true,
      stale: true,
      divergent: true,
    });
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

  it("normalises arrays and the symbol so a malformed reply cannot throw later", () => {
    expect(
      graph.parseGraphContext(
        JSON.stringify({
          status: "found",
          symbol: "nope",
          boundaries: "x",
          incoming: { calls: 3, imports: null },
          processes: {},
        }),
      ),
    ).toEqual({
      status: "found",
      symbol: null,
      boundaries: [],
      incoming: { calls: [], imports: [] },
      processes: [],
      epistemic: "",
    });
    expect(
      graph.parseGraphContext(
        JSON.stringify({
          status: "found",
          symbol: { kind: "Class", filePath: "a.php" },
          boundaries: ["b", 1],
          incoming: { calls: [{ name: "x" }, null] },
          processes: [null, "p1", { name: "p2" }, 3],
          epistemic: "graph",
        }),
      ),
    ).toMatchObject({
      symbol: { kind: "Class", filePath: "a.php" },
      boundaries: ["b"],
      incoming: { calls: [{ name: "x" }], imports: [] },
      processes: ["p1", { name: "p2" }],
      epistemic: "graph",
    });
  });
});

describe("codegraphOverview", () => {
  it("returns null when the repo has no .codegraph directory", () => {
    const root = mkdtempSync(join(tmpdir(), "investigate-cg-"));
    expect(
      graph.codegraphOverview({ repoRoot: root, env: process.env }, ["Foo"]),
    ).toBeNull();
  });

  function indexedRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "investigate-cg-"));
    mkdirSync(join(root, ".codegraph"));
    return root;
  }

  it("returns the explore output through the env's PATH", () => {
    expect(
      graph.codegraphOverview(
        { repoRoot: indexedRoot(), env: { PATH: FAKE_CODEGRAPH_PATH } },
        ["Foo"],
      ),
    ).toEqual(["line 1", "line 2", "line 3"]);
  });

  it("truncates past 80 lines and says how many were cut", () => {
    const lines = graph.codegraphOverview(
      {
        repoRoot: indexedRoot(),
        env: { PATH: FAKE_CODEGRAPH_PATH, FAKE_CODEGRAPH_LINES: "85" },
      },
      ["Foo"],
    );
    expect(lines).toHaveLength(81);
    expect(lines?.at(-1)).toBe(
      "… truncated (5 more lines; run codegraph explore for full output)",
    );
  });

  it("returns null when explore exits non-zero", () => {
    expect(
      graph.codegraphOverview(
        {
          repoRoot: indexedRoot(),
          env: { PATH: FAKE_CODEGRAPH_PATH, FAKE_CODEGRAPH_EXIT: "3" },
        },
        ["Foo"],
      ),
    ).toBeNull();
  });
});
