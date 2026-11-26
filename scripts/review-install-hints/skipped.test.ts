import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type Files,
  git,
  hints,
  hintsFor,
  makeRepo,
  registerSandbox,
  schemaEnum,
} from "./helpers.ts";

const unsafeDirs = [
  "x$(touch PWNED)",
  'a"b',
  "-dash",
  "a/-b",
  "a\nb",
  "caf\u00e9",
  "a;b",
  "a`b",
  "a:(top)",
];

registerSandbox();

describe("install-hints.mjs", () => {
  describe("skipped", () => {
    const symlinkCases: [string, Files, Files, string][] = [
      [
        "a package.json symlink",
        { "real.json": JSON.stringify({ scripts: { postinstall: "evil" } }) },
        { "package.json": "real.json" },
        "package.json",
      ],
      [
        "a lockfile symlink",
        {},
        { "package-lock.json": "x" },
        "package-lock.json",
      ],
      [
        "a Makefile symlink",
        { "real.mk": "install:\n" },
        { Makefile: "real.mk" },
        "Makefile",
      ],
      ["a setup script symlink", {}, { "bin/setup": "x" }, "bin/setup"],
      [
        "a README symlink",
        { "AGENTS.md": "## Setup\n" },
        { "README.md": "AGENTS.md" },
        "README.md",
      ],
      ["a runtime pin symlink", {}, { ".nvmrc": "x" }, ".nvmrc"],
    ];

    it.each(symlinkCases)("never reads %s", (_name, files, links, path) => {
      const lockfileIsLink = path === "package-lock.json";
      const lock: Files = lockfileIsLink ? {} : { "package-lock.json": "{}\n" };
      const result = hints({ ...files, ...lock }, undefined, links);

      expect(result.skipped).toEqual([{ path, reason: "symlink" }]);
      expect(result.installHooks).toEqual([]);
      expect(result.lockfiles).toEqual(
        lockfileIsLink
          ? []
          : [
              {
                path: "package-lock.json",
                manager: "npm",
                likelyCommand: "npm ci",
              },
            ],
      );
    });

    const installDirCases: [string, string, string, string][] = [
      ["npm", "package-lock.json", "node_modules", ""],
      ["composer", "composer.lock", "vendor", "app/"],
      ["uv", "uv.lock", ".venv", ""],
      ["yarn", "yarn.lock", ".pnp.cjs", "web/"],
    ];

    it.each(installDirCases)(
      "leaves a %s lockfile out when its directory tracks %s as a symlink",
      (_manager, lockfile, name, dir) => {
        const result = hints({ [`${dir}${lockfile}`]: "x\n" }, undefined, {
          [`${dir}${name}`]: "/tmp/elsewhere",
        });

        expect(result.lockfiles).toEqual([]);
        expect(result.skipped).toEqual([
          { path: `${dir}${name}`, reason: "symlinked-install-dir" },
        ]);
      },
    );

    it("keeps a lockfile whose sibling directory has an install directory symlink", () => {
      const result = hints(
        { "a/package-lock.json": "{}\n", "b/package-lock.json": "{}\n" },
        undefined,
        { "b/node_modules": "/tmp/elsewhere" },
      );

      expect(result.lockfiles).toEqual([
        {
          path: "a/package-lock.json",
          manager: "npm",
          likelyCommand: "npm ci",
        },
      ]);
      expect(result.skipped).toEqual([
        { path: "b/node_modules", reason: "symlinked-install-dir" },
      ]);
    });

    it("skips a symlinked .env.example and falls back to .env.dist", () => {
      const result = hints({ ".env.dist": "A=1\n" }, undefined, {
        ".env.example": "/etc/passwd",
      });

      expect(result.envExample).toBe(".env.dist");
      expect(result.skipped).toEqual([
        { path: ".env.example", reason: "symlink" },
      ]);
      expect(
        hints({}, undefined, { ".env.example": "x" }).envExample,
      ).toBeNull();
    });

    it("offers no example when the tree tracks .env, as a file or as a symlink", () => {
      expect(
        hints({ ".env": "A=1\n", ".env.example": "A=1\n" }).envExample,
      ).toBeNull();
      expect(
        hints({ ".env.example": "A=1\n" }, undefined, {
          ".env": "/etc/passwd",
        }).envExample,
      ).toBeNull();
    });

    it("offers no example when the tracked .env differs only in case", () => {
      expect(
        hints({ ".env.example": "A=1\n" }, undefined, {
          ".ENV": "/etc/passwd",
        }).envExample,
      ).toBeNull();
      expect(
        hints({ ".Env": "A=1\n", ".env.example": "A=1\n" }).envExample,
      ).toBeNull();
    });

    it("keeps an example next to a nested .env", () => {
      expect(
        hints({ "app/.env": "A=1\n", ".env.example": "A=1\n" }).envExample,
      ).toBe(".env.example");
    });

    it("lists the target of a symlinked README when it is tracked itself", () => {
      const result = hints({ "AGENTS.md": "## Setup\n" }, undefined, {
        "README.md": "AGENTS.md",
      });

      expect(result.entryPoints).toEqual([
        { path: "AGENTS.md", kind: "docs-section", names: ["Setup"] },
      ]);
    });

    it.each([
      "package.json",
      "package-lock.json",
      "Makefile",
      "bin/setup",
      ".nvmrc",
      "web/composer.lock",
    ])("never reads %s when it is a submodule", (path) => {
      const { cwd, sha } = makeRepo({ "web/composer.json": "{}\n" });

      git(cwd, "update-index", "--add", "--cacheinfo", `160000,${sha},${path}`);
      git(cwd, "commit", "-q", "-m", "link");

      const result = hintsFor(cwd, git(cwd, "rev-parse", "HEAD"));

      expect(result.skipped).toEqual([{ path, reason: "submodule" }]);
      expect(result.entryPoints).toEqual([]);
    });

    it("reports an unreadable file and still lists the rest", () => {
      const { cwd, sha } = makeRepo({
        "package.json": JSON.stringify({ scripts: { postinstall: "x" } }),
        "composer.lock": "{}\n",
        "composer.json": JSON.stringify({ scripts: { init: "y" } }),
      });
      const blob = git(cwd, "rev-parse", `${sha}:package.json`);

      rmSync(join(cwd, ".git", "objects", blob.slice(0, 2), blob.slice(2)));

      const result = hintsFor(cwd, sha);

      expect(result.skipped).toEqual([
        { path: "package.json", reason: "unreadable" },
      ]);
      expect(result.lockfiles).toHaveLength(1);
      expect(result.installHooks).toEqual([
        { path: "composer.json", name: "init", command: "y" },
      ]);
    });

    it.each([
      ["a truncated document", "{"],
      ["an array", "[]"],
      ["null", "null"],
      ["a string", '"x"'],
      ["an empty file", ""],
    ])("reports %s as invalid-json", (_name, text) => {
      const result = hints({ "package.json": text, "composer.json": text });

      expect(result.skipped).toEqual([
        { path: "composer.json", reason: "invalid-json" },
        { path: "package.json", reason: "invalid-json" },
      ]);
    });

    it("strips a leading byte order mark before parsing", () => {
      const result = hints({
        "package.json": `﻿${JSON.stringify({ scripts: { postinstall: "bom" } })}`,
      });

      expect(result.installHooks).toEqual([
        { path: "package.json", name: "postinstall", command: "bom" },
      ]);
      expect(result.skipped).toEqual([]);
    });

    it("sorts by path, then reason", () => {
      const result = hints(
        { "package.json": "{", "-d/package.json": "{}\n", "a/-d/x": "y" },
        undefined,
        { "-d/package-lock.json": "x", Makefile: "x" },
      );

      expect(result.skipped).toEqual([
        { path: "-d/package-lock.json", reason: "symlink" },
        { path: "-d/package-lock.json", reason: "unsafe-path" },
        { path: "-d/package.json", reason: "unsafe-path" },
        { path: "Makefile", reason: "symlink" },
        { path: "package.json", reason: "invalid-json" },
      ]);
    });

    it("has exactly the documented reasons in the schema", () => {
      expect(schemaEnum("skipped", "[]", "reason")).toEqual([
        "symlink",
        "submodule",
        "unreadable",
        "invalid-json",
        "unsafe-path",
        "symlinked-install-dir",
      ]);
    });
  });

  describe("unsafe paths", () => {
    it.each(unsafeDirs)(
      "keeps %j out of the lists but shows its hooks",
      (dir) => {
        const result = hints({
          [`${dir}/package-lock.json`]: "{}\n",
          [`${dir}/package.json`]: JSON.stringify({
            scripts: { setup: "x", postinstall: "hook" },
            engines: { node: ">=22" },
          }),
          [`${dir}/.nvmrc`]: "22\n",
        });

        expect(result.lockfiles).toEqual([]);
        expect(result.entryPoints).toEqual([]);
        expect(result.runtimes).toEqual([]);
        expect(result.tools).toEqual([]);
        expect(result.installHooks).toEqual([
          { path: `${dir}/package.json`, name: "postinstall", command: "hook" },
        ]);
        expect(result.skipped).toEqual([
          { path: `${dir}/package-lock.json`, reason: "unsafe-path" },
          { path: `${dir}/package.json`, reason: "unsafe-path" },
        ]);
      },
    );

    it("lists a path made only of allowed characters", () => {
      const dir = "my dir@1+x_y.z-w";
      const result = hints({
        [`${dir}/package-lock.json`]: "{}\n",
        [`${dir}/package.json`]: JSON.stringify({ scripts: { setup: "x" } }),
      });

      expect(result.lockfiles).toHaveLength(1);
      expect(result.entryPoints).toEqual([
        { path: `${dir}/package.json`, kind: "npm-script", names: ["setup"] },
      ]);
      expect(result.skipped).toEqual([]);
    });
  });
});
