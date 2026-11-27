import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { realGit } from "../review-test-git.ts";
import {
  commitFiles,
  hints,
  hintsFor,
  makeBin,
  makeRepo,
  registerSandbox,
  run,
  sandbox,
  write,
} from "./helpers.ts";

registerSandbox();

describe("install-hints.mjs", () => {
  it("prints every key with empty values for a repo with nothing to install", () => {
    const { cwd, sha } = makeRepo();
    const result = run(cwd, sha);

    expect(result.status).toBe(0);
    expect(result.stdout.endsWith("}\n")).toBe(true);
    expect(JSON.parse(result.stdout)).toEqual({
      headSha: sha,
      lockfiles: [],
      entryPoints: [],
      installHooks: [],
      runtimes: [],
      tools: [],
      envExample: null,
      skipped: [],
    });
  });

  it("reads the tree at the SHA, not the working tree", () => {
    const { cwd, sha } = makeRepo({ "composer.lock": "{}\n" });

    rmSync(join(cwd, "composer.lock"));
    commitFiles(cwd, { "package-lock.json": "{}\n" });

    const result = hintsFor(cwd, sha);

    expect(result.lockfiles).toEqual([
      {
        path: "composer.lock",
        manager: "composer",
        likelyCommand: "composer install",
      },
    ]);
  });

  it("exits 1 with a message for a SHA git cannot read", () => {
    const { cwd } = makeRepo();
    const result = run(cwd, "0".repeat(40));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("cannot read");
  });

  it("rejects an option-looking argument and a missing argument", () => {
    const { cwd } = makeRepo();
    const option = run(cwd, "--output=/tmp/x");
    const missing = run(cwd);

    expect(option.status).toBe(1);
    expect(option.stdout).toBe("");
    expect(option.stderr).toContain("cannot read");
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("usage");
  });

  describe("run from a subdirectory", () => {
    it("prints the same hints as from the root and does not crash on a pin file", () => {
      const { cwd, sha } = makeRepo({
        "package.json": JSON.stringify({ scripts: { postinstall: "root" } }),
        "package-lock.json": "{}\n",
        "web/package.json": JSON.stringify({ scripts: { prepare: "web" } }),
        "web/package-lock.json": "{}\n",
        "web/.nvmrc": "20\n",
        "docs/.python-version": "3.13\n",
      });
      const fromRoot = hintsFor(cwd, sha);
      const fromWeb = hintsFor(join(cwd, "web"), sha);
      const fromDocs = hintsFor(join(cwd, "docs"), sha);

      expect(fromWeb).toEqual(fromRoot);
      expect(fromDocs).toEqual(fromRoot);
      expect(fromRoot.installHooks).toEqual([
        { path: "package.json", name: "postinstall", command: "root" },
        { path: "web/package.json", name: "prepare", command: "web" },
      ]);
      expect(fromRoot.runtimes).toEqual([
        { path: "web/.nvmrc", tool: "node", version: "20" },
      ]);
    });
  });

  describe("PATH handling", () => {
    const fakeScript = (marker: string): string =>
      `#!/bin/sh\necho ran > '${marker}'\nexit 1\n`;

    it.each([
      ["a relative entry", "fakebin", "fakebin/git"],
      ["an empty entry", "", "git"],
    ])("never runs a git found through %s", (_name, entry, relative) => {
      const { cwd, sha } = makeRepo();
      const marker = join(cwd, "marker");

      write(cwd, relative, fakeScript(marker));
      chmodSync(join(cwd, relative), 0o755);

      const result = run(cwd, sha, `${entry}${delimiter}${makeBin()}`);

      expect(result.status).toBe(0);
      expect(() => readFileSync(marker)).toThrow();
    });

    it("never runs a git from an absolute entry inside the repository whose name starts with two dots", () => {
      const { cwd, sha } = makeRepo();
      const marker = join(cwd, "marker");

      write(cwd, "..bin/git", fakeScript(marker));
      chmodSync(join(cwd, "..bin", "git"), 0o755);

      const result = run(
        cwd,
        sha,
        `${join(cwd, "..bin")}${delimiter}${makeBin()}`,
      );

      expect(result.status).toBe(0);
      expect(() => readFileSync(marker)).toThrow();
    });

    it("exits 1 with a message when git is not on PATH", () => {
      const { cwd, sha } = makeRepo();
      const result = run(cwd, sha, sandbox.makeDir("no-git"));

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("git");
    });

    it.each([
      ["a relative entry", "fakebin"],
      ["an empty entry", ""],
    ])("ignores a tool found through %s", (_name, entry) => {
      const { cwd, sha } = makeRepo({ "composer.lock": "{}\n" });

      write(cwd, join(entry, "composer"), "#!/bin/sh\n");
      chmodSync(join(cwd, entry, "composer"), 0o755);

      const result = hintsFor(cwd, sha, `${entry}${delimiter}${makeBin()}`);

      expect(result.tools).toEqual([{ name: "composer", onPath: false }]);
    });

    it("needs the executable bit", () => {
      const bin = makeBin(["composer"]);

      chmodSync(join(bin, "composer"), 0o644);

      expect(hints({ "composer.lock": "{}\n" }, bin).tools).toEqual([
        { name: "composer", onPath: false },
      ]);
    });

    it("needs a file, not a directory", () => {
      const bin = makeBin();

      mkdirSync(join(bin, "composer"), { mode: 0o755 });

      expect(hints({ "composer.lock": "{}\n" }, bin).tools).toEqual([
        { name: "composer", onPath: false },
      ]);
    });

    it("hands a ref that looks like an option to no git process", () => {
      const { cwd } = makeRepo();
      const bin = makeBin();
      const log = join(cwd, "git.log");

      rmSync(join(bin, "git"));
      writeFileSync(
        join(bin, "git"),
        `#!/bin/sh\necho "$@" >> '${log}'\nexec '${realGit}' "$@"\n`,
      );
      chmodSync(join(bin, "git"), 0o755);

      const result = run(cwd, "--output=/tmp/x", bin);

      expect(result.status).toBe(1);
      expect(() => readFileSync(log)).toThrow();
    });
  });
});
