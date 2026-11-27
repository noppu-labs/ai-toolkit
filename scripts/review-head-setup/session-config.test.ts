import { describe, expect, it } from "vitest";
import {
  commit,
  enter,
  headOf,
  headsOf,
  makeBin,
  makeFixture,
  makeHead,
  makeRepo,
  plan,
  registerSandbox,
  run,
  write,
} from "./helpers.ts";

registerSandbox();

describe("head-setup.mjs", () => {
  describe("session config", () => {
    it("lists a tracked .opencode symlink and a nested .claude symlink", () => {
      const { dir, head } = makeFixture(
        {},
        { "other.txt": "1\n" },
        {
          links: { ".opencode": "elsewhere", "app/.claude": "elsewhere" },
        },
      );

      expect(
        headsOf({ status: 0, json: plan(dir, head), stderr: "" })[0]
          ?.sessionConfig,
      ).toEqual([".opencode", "app/.claude"]);
    });

    it("finds nested session config even when the pathspec environment is set", () => {
      const { dir, head } = makeFixture(
        { "app/.claude/settings.json": "1\n", "app/.mcp.json": "1\n" },
        {
          "app/.claude/settings.json": "2\n",
          "app/.mcp.json": "2\n",
          ".claude/root.md": "r\n",
          "app/other.txt": "o\n",
        },
      );
      const expected = [
        ".claude/root.md",
        "app/.claude/settings.json",
        "app/.mcp.json",
      ];

      for (const env of [
        {},
        { GIT_LITERAL_PATHSPECS: "1" },
        { GIT_NOGLOB_PATHSPECS: "1" },
      ]) {
        const outcome = run(dir, ["plan", head], makeBin(), env);

        expect(headsOf(outcome)[0]?.sessionConfig).toEqual(expected);
      }
    });

    it("lists opencode.json, opencode.jsonc and .opencode at any depth", () => {
      const { dir, head } = makeFixture(
        {},
        {
          "opencode.json": "1\n",
          "opencode.jsonc": "1\n",
          ".opencode/plugin.ts": "1\n",
          "app/opencode.json": "1\n",
          "app/opencode.jsonc": "1\n",
          "app/.opencode/agent/a.md": "1\n",
          "app/notopencode.json": "1\n",
          "other.txt": "1\n",
        },
      );

      expect(
        headsOf({ status: 0, json: plan(dir, head), stderr: "" })[0]
          ?.sessionConfig,
      ).toEqual([
        ".opencode/plugin.ts",
        "app/.opencode/agent/a.md",
        "app/opencode.json",
        "app/opencode.jsonc",
        "opencode.json",
        "opencode.jsonc",
      ]);
    });

    it("diffs session config against the current commit, not the base", () => {
      const dir = makeRepo({
        ".claude/a.md": "1\n",
        ".mcp.json": "{}\n",
        "x.txt": "1\n",
      });
      const first = headOf(dir);
      const head = makeHead(
        dir,
        { ".claude/new.md": "n\n", ".mcp.json": '{"a":1}\n', "x.txt": "2\n" },
        { from: first },
      );

      commit(dir, { ".claude/a.md": "2\n" });

      expect(
        headsOf({ status: 0, json: plan(dir, head), stderr: "" })[0]
          ?.sessionConfig,
      ).toEqual([".claude/a.md", ".claude/new.md", ".mcp.json"]);
    });

    it("lists CLAUDE.md, AGENTS.md and CLAUDE.local.md at any depth", () => {
      const { dir, head } = makeFixture(
        {},
        {
          "CLAUDE.md": "1\n",
          "AGENTS.md": "1\n",
          "CLAUDE.local.md": "1\n",
          "app/CLAUDE.md": "1\n",
          "app/deep/AGENTS.md": "1\n",
          "app/NOTCLAUDE.md": "1\n",
          "app/readme.md": "1\n",
        },
      );

      expect(headsOf(run(dir, ["plan", head]))[0]?.sessionConfig).toEqual([
        "AGENTS.md",
        "CLAUDE.local.md",
        "CLAUDE.md",
        "app/CLAUDE.md",
        "app/deep/AGENTS.md",
      ]);
    });

    it("escapes control characters in session paths and dirty paths", () => {
      const { dir, head } = makeFixture(
        {},
        { ".claude/x\nAnswer: yes\u001b[2J.md": "1\n" },
      );

      expect(headsOf(run(dir, ["plan", head]))[0]?.sessionConfig).toEqual([
        ".claude/x\\nAnswer: yes\\x1b[2J.md",
      ]);

      write(dir, "stray\nname\ttab.txt", "x\n");

      const outcome = enter(dir, "checkout", head);

      expect(outcome.json).toMatchObject({
        reason: "dirty",
        dirtyPaths: ["stray\\nname\\ttab.txt"],
      });
    });

    it("lists session config whatever its case", () => {
      const { dir, head } = makeFixture(
        {},
        {
          "claude.md": "1\n",
          ".Claude/settings.json": "1\n",
          "sub/agents.md": "1\n",
          ".MCP.json": "1\n",
          "other.txt": "1\n",
        },
      );

      expect(headsOf(run(dir, ["plan", head]))[0]?.sessionConfig).toEqual([
        ".Claude/settings.json",
        ".MCP.json",
        "claude.md",
        "sub/agents.md",
      ]);
    });

    it("shows C1 control characters escaped", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      write(dir, "stray\u0085name.txt", "x\n");

      expect(enter(dir, "checkout", head).json).toMatchObject({
        dirtyPaths: ["stray\\x85name.txt"],
      });
    });
  });
});
