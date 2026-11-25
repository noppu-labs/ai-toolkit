import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
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
  graphContext: (
    ctx: { repoRoot: string; repoName: string; env: NodeJS.ProcessEnv },
    symbolName: string,
  ) => GraphContext | null;
  codegraphOverview: (
    ctx: { repoRoot: string; env: NodeJS.ProcessEnv },
    names: string[],
  ) => string[] | null;
  codegraphIndex: (ctx: { repoRoot: string; env: NodeJS.ProcessEnv }) => {
    state: "absent" | "present" | "tracked" | "unknown";
    root?: string;
  };
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

  it("finds a linked worktree by its path when it was indexed under another name", () => {
    const worktree = [
      "  GitNexus List (1.6.12)",
      "",
      "  Indexed Repositories (2)",
      "",
      "  my-repo",
      "    Path:    /tmp/my-repo",
      "    Commit:  1111111",
      "    Branch:  main",
      "",
      "  my-repo-run-42",
      "    Path:    /tmp/worktrees/run-42",
      "    Commit:  2222222",
      "",
    ].join("\n");
    expect(
      freshness.parseGitnexusList(worktree, "run-42", "/tmp/worktrees/run-42"),
    ).toEqual({ ok: true, indexed: "2222222", branch: "?" });
  });

  it("reads a name gitnexus disambiguates with a path suffix", () => {
    const shared = [
      "  my-repo  (/tmp/clone-a)",
      "    Path:    /tmp/clone-a",
      "    Commit:  1111111",
      "",
      "  my-repo  (/tmp/my-repo)",
      "    Path:    /tmp/my-repo",
      "    Commit:  2222222",
      "    Branch:  dev",
      "",
    ].join("\n");
    expect(
      freshness.parseGitnexusList(shared, "my-repo", "/tmp/elsewhere"),
    ).toMatchObject({
      ok: false,
      note: expect.stringContaining("points at /tmp/clone-a"),
    });
    expect(
      freshness.parseGitnexusList(shared, "my-repo", "/tmp/my-repo"),
    ).toEqual({ ok: true, indexed: "2222222", branch: "dev" });
  });

  it("never takes the next entry's commit for an entry that has none", () => {
    const listing = [
      "my-repo",
      "  Path:    /tmp/my-repo",
      "",
      "other",
      "  Path:    /tmp/other",
      "  Commit:  3333333",
      "",
    ].join("\n");
    expect(
      freshness.parseGitnexusList(listing, "my-repo", "/tmp/my-repo"),
    ).toMatchObject({
      ok: false,
      note: expect.stringContaining("could not parse"),
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

describe("graphContext", () => {
  it("asks gitnexus for the repo by its path, not its directory name", () => {
    const root = mkdtempSync(join(tmpdir(), "investigate-wt-"));
    const env = {
      PATH: FAKE_GITNEXUS_PATH,
      FAKE_GITNEXUS_CONTEXT: '{"status":"found","symbol":{}}',
      FAKE_GITNEXUS_REPO: root,
    };
    expect(
      graph.graphContext({ repoRoot: root, repoName: "run-42", env }, "Foo"),
    ).toMatchObject({ status: "found" });
    expect(
      graph.graphContext(
        {
          repoRoot: root,
          repoName: "run-42",
          env: { ...env, FAKE_GITNEXUS_REPO: "run-42" },
        },
        "Foo",
      ),
    ).toBeNull();
  });
});

function readArgv(file: string): string[] {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (
    !(
      Array.isArray(parsed) &&
      parsed.every((a): a is string => typeof a === "string")
    )
  ) {
    throw new Error(`${file} does not hold an argument list`);
  }

  return parsed;
}

describe("graphContext on hostile names", () => {
  it("passes a name that looks like an option after --, as the symbol", () => {
    const root = mkdtempSync(join(tmpdir(), "investigate-gx-argv-"));
    const argvFile = join(root, "argv.json");
    graph.graphContext(
      {
        repoRoot: root,
        repoName: "run-42",
        env: { PATH: FAKE_GITNEXUS_PATH, FAKE_ARGV_FILE: argvFile },
      },
      "--repo=elsewhere",
    );
    expect(readArgv(argvFile)).toEqual([
      "context",
      "--repo",
      root,
      "--",
      "--repo=elsewhere",
    ]);
  });
});

// A repository inside `outer`, so a test can put an index above it.
function makeIndexRepo(
  tracked: Record<string, string>,
  outer: string = realpathSync(
    mkdtempSync(join(tmpdir(), "investigate-cg-outer-")),
  ),
): string {
  const root = join(outer, "repo");
  mkdirSync(join(root, ".codegraph"), { recursive: true });
  git(root, "init", "-q", "-b", "main");
  for (const [rel, content] of Object.entries(tracked)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), content);
    git(root, "add", "-f", rel);
  }
  return root;
}

// A directory holding a codegraph database, as `codegraph init` leaves it.
function makeIndexedDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "investigate-cg-idx-")));
  mkdirSync(join(dir, ".codegraph"));
  writeFileSync(join(dir, ".codegraph", "codegraph.db"), "");
  return dir;
}

describe("codegraphIndex", () => {
  const env = { PATH: process.env.PATH ?? "" };
  const ignoreOnly = { ".codegraph/.gitignore": "*\n" };

  it("is present, in the repository, when its own .codegraph holds a database", () => {
    const root = makeIndexRepo(ignoreOnly);
    writeFileSync(join(root, ".codegraph", "codegraph.db"), "");
    expect(graph.codegraphIndex({ repoRoot: root, env })).toEqual({
      state: "present",
      root,
    });
  });

  it("is absent when neither the repository nor a directory above it holds a database", () => {
    const outer = realpathSync(
      mkdtempSync(join(tmpdir(), "investigate-cg-none-")),
    );
    // codegraph keeps its own install in ~/.codegraph, with no database in it.
    mkdirSync(join(outer, ".codegraph"));
    expect(
      graph.codegraphIndex({ repoRoot: makeIndexRepo(ignoreOnly, outer), env }),
    ).toEqual({ state: "absent" });
    const bare = join(outer, "bare");
    mkdirSync(bare);
    expect(graph.codegraphIndex({ repoRoot: bare, env })).toEqual({
      state: "absent",
    });
  });

  it("is present, in the directory above, when only that directory holds a database", () => {
    const outer = makeIndexedDir();
    expect(
      graph.codegraphIndex({ repoRoot: makeIndexRepo(ignoreOnly, outer), env }),
    ).toEqual({ state: "present", root: outer });
    const bare = join(outer, "a", "b");
    mkdirSync(bare, { recursive: true });
    expect(graph.codegraphIndex({ repoRoot: bare, env })).toEqual({
      state: "present",
      root: outer,
    });
  });

  it("is tracked when git tracks anything else under .codegraph, in any case", () => {
    for (const rel of [
      ".codegraph/codegraph.db",
      ".codegraph/sub/.gitignore",
      ".CodeGraph/codegraph.db",
    ]) {
      const root = makeIndexRepo({ [rel]: "x\n" }, makeIndexedDir());
      for (const extra of [{}, { GIT_LITERAL_PATHSPECS: "1" }]) {
        expect(
          graph.codegraphIndex({ repoRoot: root, env: { ...env, ...extra } }),
        ).toEqual({ state: "tracked" });
      }
    }
  });

  it("is unknown when git cannot list the directory", () => {
    const root = mkdtempSync(join(tmpdir(), "investigate-cg-nogit-"));
    mkdirSync(join(root, ".codegraph"));
    expect(graph.codegraphIndex({ repoRoot: root, env })).toEqual({
      state: "unknown",
    });
  });
});

describe("codegraphOverview", () => {
  it("passes names that look like options after --, as the query", () => {
    const root = mkdtempSync(join(tmpdir(), "investigate-cg-argv-"));
    const argvFile = join(root, "argv.json");
    graph.codegraphOverview(
      {
        repoRoot: root,
        env: { PATH: FAKE_CODEGRAPH_PATH, FAKE_ARGV_FILE: argvFile },
      },
      ["--path=/elsewhere", "Foo"],
    );
    expect(readArgv(argvFile)).toEqual([
      "explore",
      "--max-files",
      "0",
      "--no-color",
      "--",
      "--path=/elsewhere",
      "Foo",
      "callers and relationships",
    ]);
  });

  // codegraphIndex decides whether to run; codegraph finds the index itself.
  function indexedRoot(): string {
    return mkdtempSync(join(tmpdir(), "investigate-cg-"));
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
