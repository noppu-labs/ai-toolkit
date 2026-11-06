import { describe, expect, it } from "vitest";
import { commitOf, newWorld, setLatest } from "./fixtures.ts";
import {
  fetchRepoFile,
  MAX_FILE_BYTES,
  npmLatestVersion,
  resolveCommit,
} from "./sources.ts";

describe("npmLatestVersion", () => {
  it("reads latest from the dist-tags of a scoped package", async () => {
    const world = newWorld();
    setLatest(world, "@noppu-labs/opencode-x", "1.2.3");
    await expect(
      npmLatestVersion("@noppu-labs/opencode-x", world.fetcher),
    ).resolves.toBe("1.2.3");
  });

  it("throws on a registry error", async () => {
    const world = newWorld();
    world.routes.set(
      "https://registry.npmjs.org/-/package/opencode-x/dist-tags",
      { body: "oops", status: 500 },
    );
    await expect(npmLatestVersion("opencode-x", world.fetcher)).rejects.toThrow(
      "opencode-x: npm registry returned 500",
    );
  });
});

describe("resolveCommit", () => {
  const repo = "noppu-labs/opencode-x";

  it("prefers the peeled commit of an annotated tag", async () => {
    const world = newWorld();
    world.refs.set(`${repo} refs/tags/v1.0.0`, commitOf("a"));
    world.refs.set(`${repo} refs/tags/v1.0.0^{}`, commitOf("b"));
    await expect(resolveCommit(repo, "v1.0.0", world.git)).resolves.toBe(
      commitOf("b"),
    );
  });

  it("falls back to the tag, then to the branch", async () => {
    const world = newWorld();
    world.refs.set(`${repo} refs/tags/v1.0.0`, commitOf("a"));
    world.refs.set(`${repo} refs/heads/feat/y`, commitOf("c"));
    await expect(resolveCommit(repo, "v1.0.0", world.git)).resolves.toBe(
      commitOf("a"),
    );
    await expect(resolveCommit(repo, "feat/y", world.git)).resolves.toBe(
      commitOf("c"),
    );
  });

  it("passes a 40-character hex ref through without asking git", async () => {
    const git = (): Promise<string> => Promise.reject(new Error("no git"));
    await expect(resolveCommit(repo, commitOf("d"), git)).resolves.toBe(
      commitOf("d"),
    );
  });

  it("throws when nothing matches", async () => {
    await expect(resolveCommit(repo, "nope", newWorld().git)).rejects.toThrow(
      `${repo}: no tag or branch named nope`,
    );
  });
});

describe("fetchRepoFile", () => {
  const repo = "noppu-labs/opencode-x";
  const commit = commitOf("e");
  const url = `https://raw.githubusercontent.com/${repo}/${commit}/docs/a.png`;

  it("returns the bytes", async () => {
    const world = newWorld();
    world.routes.set(url, { body: "abc" });
    const bytes = await fetchRepoFile(
      repo,
      commit,
      "docs/a.png",
      world.fetcher,
    );
    expect(new TextDecoder().decode(bytes)).toBe("abc");
  });

  it("throws on a non-200 status", async () => {
    await expect(
      fetchRepoFile(repo, commit, "docs/a.png", newWorld().fetcher),
    ).rejects.toThrow(`${repo}@eeeeeee: docs/a.png returned 404`);
  });

  it("accepts exactly 1 MiB and rejects one byte more", async () => {
    const world = newWorld();
    world.routes.set(url, { body: new Uint8Array(MAX_FILE_BYTES) });
    await expect(
      fetchRepoFile(repo, commit, "docs/a.png", world.fetcher),
    ).resolves.toHaveLength(MAX_FILE_BYTES);
    world.routes.set(url, { body: new Uint8Array(MAX_FILE_BYTES + 1) });
    await expect(
      fetchRepoFile(repo, commit, "docs/a.png", world.fetcher),
    ).rejects.toThrow(`${repo}: docs/a.png is over 1 MiB`);
  });
});
