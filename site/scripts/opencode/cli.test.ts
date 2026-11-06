import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "./cli.ts";
import {
  commitOf,
  newWorld,
  pluginFiles,
  release,
  setRepo,
  type World,
} from "./fixtures.ts";

const SEED = {
  lockfileVersion: 1,
  plugins: {
    "opencode-x": {
      repo: "noppu-labs/opencode-x",
      package: "@noppu-labs/opencode-x",
    },
    "opencode-y": {
      repo: "noppu-labs/opencode-y",
      package: "@noppu-labs/opencode-y",
    },
  },
};

let siteDir = "";
let logs: string[] = [];

afterEach(() => {
  if (siteDir !== "") {
    rmSync(siteDir, { recursive: true, force: true });
    siteDir = "";
  }
});

function setup(): World {
  siteDir = mkdtempSync(join(tmpdir(), "opencode-cli-"));
  writeFileSync(join(siteDir, "opencode-lock.json"), JSON.stringify(SEED));
  logs = [];
  const world = newWorld();
  release(world, "opencode-x", "1.2.3", commitOf("a"));
  release(world, "opencode-y", "2.0.0", commitOf("b"));
  return world;
}

function run(world: World, ...argv: string[]): Promise<number> {
  return main(argv, {
    fetcher: world.fetcher,
    git: world.git,
    siteDir,
    log: (line: string): void => {
      logs.push(line);
    },
  });
}

const lockPath = (): string => join(siteDir, "opencode-lock.json");
const lockOf = (): { plugins: Record<string, Record<string, unknown>> } =>
  JSON.parse(readFileSync(lockPath(), "utf8"));
const copy = (name: string, path: string): string =>
  join(siteDir, "src/content/opencode", name, path);

describe("main sync", () => {
  it("writes both plugins and the lock on a first sync", async () => {
    const world = setup();
    expect(await run(world)).toBe(0);
    const lock = lockOf();
    expect(lock.plugins["opencode-x"]).toMatchObject({
      version: "1.2.3",
      commit: commitOf("a"),
    });
    expect(lock.plugins["opencode-y"]).toMatchObject({ version: "2.0.0" });
    expect(existsSync(copy("opencode-x", "docs/toolkit-page.yaml"))).toBe(true);
    expect(
      existsSync(copy("opencode-y", "docs/images/social-preview.png")),
    ).toBe(true);
    expect(logs).toEqual([
      `opencode-x: new -> 1.2.3@${commitOf("a").slice(0, 7)}`,
      `opencode-y: new -> 2.0.0@${commitOf("b").slice(0, 7)}`,
    ]);
    expect(await run(world, "--check")).toBe(0);
  });

  it("leaves the lock untouched on an identical second run", async () => {
    const world = setup();
    await run(world);
    const bytes = readFileSync(lockPath(), "utf8");
    const past = new Date(Date.now() - 60_000);
    utimesSync(lockPath(), past, past);
    const mtime = statSync(lockPath()).mtimeMs;
    logs = [];
    expect(await run(world)).toBe(0);
    expect(readFileSync(lockPath(), "utf8")).toBe(bytes);
    expect(statSync(lockPath()).mtimeMs).toBe(mtime);
    expect(logs).toEqual(["opencode-x: up to date", "opencode-y: up to date"]);
  });

  it("returns 1 for a failing plugin but still writes the other one", async () => {
    const world = setup();
    world.routes.set(
      "https://registry.npmjs.org/-/package/@noppu-labs%2Fopencode-x/dist-tags",
      { body: "boom", status: 500 },
    );
    expect(await run(world)).toBe(1);
    const lock = lockOf();
    expect(lock.plugins["opencode-y"]).toMatchObject({ version: "2.0.0" });
    expect(lock.plugins["opencode-x"]).not.toHaveProperty("version");
    expect(logs.join("\n")).toContain("opencode-x: failed");
  });

  it("records a ref, which --check then rejects", async () => {
    const world = setup();
    setRepo(
      world,
      "noppu-labs/opencode-x",
      "feat/y",
      commitOf("c"),
      pluginFiles("opencode-x", "1.2.3"),
    );
    expect(await run(world, "--ref", "opencode-x=feat/y")).toBe(0);
    expect(lockOf().plugins["opencode-x"]).toMatchObject({
      ref: "feat/y",
      tag: "feat/y",
    });
    logs = [];
    expect(await run(world, "--check")).toBe(1);
    expect(logs.join("\n")).toContain("opencode-x: pinned to ref feat/y");
  });

  it("drops the ref when the release tag points at the same commit", async () => {
    const world = setup();
    setRepo(
      world,
      "noppu-labs/opencode-x",
      "feat/y",
      commitOf("a"),
      pluginFiles("opencode-x", "1.2.3"),
    );
    await run(world, "--ref", "opencode-x=feat/y");
    expect(lockOf().plugins["opencode-x"]).toHaveProperty("ref");
    expect(await run(world)).toBe(0);
    const entry = lockOf().plugins["opencode-x"];
    expect(entry).not.toHaveProperty("ref");
    expect(entry).toMatchObject({ tag: "v1.2.3" });
    expect(await run(world, "--check")).toBe(0);
  });

  it("writes the summary only when something changed", async () => {
    const world = setup();
    const summary = join(siteDir, "summary.md");
    await run(world, "--summary", summary);
    expect(readFileSync(summary, "utf8")).toContain("| opencode-x | new |");
    rmSync(summary);
    await run(world, "--summary", summary);
    expect(existsSync(summary)).toBe(false);
  });

  it("rejects a --ref for an unknown plugin and unknown flags", async () => {
    const world = setup();
    expect(await run(world, "--ref", "opencode-q=main")).toBe(1);
    expect(await run(world, "--ref", "nonsense")).toBe(1);
    expect(await run(world, "--bogus")).toBe(1);
  });
});

describe("main --check", () => {
  it("reports edited content", async () => {
    const world = setup();
    await run(world);
    writeFileSync(copy("opencode-x", "docs/toolkit-page.yaml"), "edited");
    logs = [];
    expect(await run(world, "--check")).toBe(1);
    expect(logs.join("\n")).toContain("docs/toolkit-page.yaml differs");
  });
});
