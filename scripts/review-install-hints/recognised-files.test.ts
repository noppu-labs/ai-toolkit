import { describe, expect, it } from "vitest";
import {
  hints,
  isJson,
  lockfileCases,
  makeBin,
  registerSandbox,
  schemaEnum,
} from "./helpers.ts";

const pinCases: [string, string][] = [
  [".nvmrc", "node"],
  [".node-version", "node"],
  [".python-version", "python"],
];
const scriptFiles = [
  "bin/setup",
  "script/setup",
  "bin/bootstrap",
  "script/bootstrap",
];
const docsFiles = ["README.md", "CONTRIBUTING.md", "CLAUDE.md", "AGENTS.md"];
const entryFileCases: [string, string, string, string][] = [
  ["Makefile", "make", "install:\n\t@true\n", "install"],
  ["makefile", "make", "install:\n\t@true\n", "install"],
  ["GNUmakefile", "make", "install:\n\t@true\n", "install"],
  ["justfile", "just", "install:\n  echo\n", "install"],
  ["Justfile", "just", "install:\n  echo\n", "install"],
  ["Taskfile.yml", "task", "tasks:\n  install:\n    cmds: []\n", "install"],
  ["Taskfile.yaml", "task", "tasks:\n  install:\n    cmds: []\n", "install"],
];

registerSandbox();

describe("install-hints.mjs", () => {
  describe("recognised files", () => {
    it.each(pinCases)("reads the pin file %s", (file, tool) => {
      const result = hints({ [file]: "3.1\n" });

      expect(result.runtimes).toEqual([{ path: file, tool, version: "3.1" }]);
    });

    it.each(scriptFiles)("lists the setup script %s", (path) => {
      const result = hints({ [path]: "#!/bin/sh\n" });

      expect(result.entryPoints).toEqual([
        { path, kind: "script-file", names: [] },
      ]);
    });

    it.each(docsFiles)("lists install headings in %s", (path) => {
      const result = hints({ [path]: "# T\n## Setup\n" });

      expect(result.entryPoints).toEqual([
        { path, kind: "docs-section", names: ["Setup"] },
      ]);
    });

    it.each(entryFileCases)(
      "lists install targets in %s",
      (path, kind, text, name) => {
        const result = hints({ [path]: text });

        expect(result.entryPoints).toEqual([{ path, kind, names: [name] }]);
        expect(result.tools).toEqual([{ name: kind, onPath: false }]);
      },
    );

    it.each(lockfileCases)(
      "names the tool for %s",
      (file, extra, _manager, _command, tool) => {
        const result = hints({ [file]: "x\n", ...extra }, makeBin([tool]));

        expect(result.tools).toEqual([{ name: tool, onPath: true }]);
      },
    );

    it("keeps assignments out of the justfile recipes", () => {
      const result = hints({
        justfile: "install_dir := 'x'\nsetup := \"y\"\ninstall:\n  echo\n",
      });

      expect(result.entryPoints).toEqual([
        { path: "justfile", kind: "just", names: ["install"] },
      ]);
    });

    it("drops comments from .tool-versions", () => {
      const result = hints({
        ".tool-versions": "# pinned\nphp 8.4 # current\nnodejs 22\n",
      });

      expect(result.runtimes).toEqual([
        { path: ".tool-versions", tool: "nodejs", version: "22" },
        { path: ".tool-versions", tool: "php", version: "8.4" },
      ]);
    });

    it("reads entry points and runtimes only at the root and in lockfile directories", () => {
      const result = hints({
        "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
        "package-lock.json": "{}\n",
        "packages/a/package.json": JSON.stringify({
          scripts: { setup: "x", postinstall: "hook" },
          engines: { node: ">=18" },
        }),
        "packages/b/composer.json": JSON.stringify({
          scripts: { "install-deps": "x" },
          require: { php: "^8.1" },
        }),
      });

      expect(result.entryPoints).toEqual([]);
      expect(result.runtimes).toEqual([]);
      expect(result.installHooks).toEqual([
        {
          path: "packages/a/package.json",
          name: "postinstall",
          command: "hook",
        },
      ]);
    });

    it("has exactly the produced kinds and managers in the schema", () => {
      const kinds = hints({
        Makefile: "install:\n",
        justfile: "install:\n  echo\n",
        "Taskfile.yml": "tasks:\n  install:\n",
        "bin/setup": "x\n",
        "README.md": "## Setup\n",
        "package.json": JSON.stringify({ scripts: { setup: "x" } }),
        "composer.json": JSON.stringify({ scripts: { setup: "x" } }),
      }).entryPoints;
      const produced = Array.isArray(kinds)
        ? kinds.flatMap((entry) => (isJson(entry) ? [entry.kind] : []))
        : [];
      const managers = lockfileCases.map(([, , manager]) => manager);

      expect([...new Set(produced)].sort()).toEqual(
        schemaEnum("entryPoints", "[]", "kind").map(String).sort(),
      );
      expect([...new Set(managers)].sort()).toEqual(
        schemaEnum("lockfiles", "[]", "manager").map(String).sort(),
      );
    });
  });

  describe("example env file", () => {
    it("prefers .env.example over .env.dist", () => {
      expect(hints({ ".env.dist": "A=1\n" }).envExample).toBe(".env.dist");
      expect(
        hints({ ".env.dist": "A=1\n", ".env.example": "A=1\n" }).envExample,
      ).toBe(".env.example");
    });
  });
});
