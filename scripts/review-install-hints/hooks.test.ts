import { describe, expect, it } from "vitest";
import { hints, registerSandbox } from "./helpers.ts";

const npmHooks = [
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
  "pnpm:devPreinstall",
];
const composerHooks = [
  "pre-install-cmd",
  "post-install-cmd",
  "pre-autoload-dump",
  "post-autoload-dump",
  "init",
  "pre-command-run",
  "pre-file-download",
  "pre-operations-exec",
  "pre-package-install",
  "post-package-install",
];

registerSandbox();

describe("install-hints.mjs", () => {
  it("reads manifests in lockfile directories", () => {
    const result = hints({
      "web/package-lock.json": "{}\n",
      "web/package.json": JSON.stringify({ scripts: { prepare: "husky" } }),
    });

    expect(result.installHooks).toEqual([
      { path: "web/package.json", name: "prepare", command: "husky" },
    ]);
  });

  it("reports a workspace member's install hook but not a vendored one", () => {
    const result = hints({
      "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
      "package-lock.json": "{}\n",
      "packages/a/package.json": JSON.stringify({
        scripts: { postinstall: "node a.js", preprepare: "x", build: "y" },
      }),
      "packages/b/composer.json": JSON.stringify({
        scripts: { "pre-autoload-dump": "@php b" },
      }),
      "vendor/pkg/composer.json": JSON.stringify({
        scripts: { "post-install-cmd": "evil" },
      }),
      "packages/a/node_modules/x/package.json": JSON.stringify({
        scripts: { postinstall: "evil" },
      }),
    });

    expect(result.installHooks).toEqual([
      {
        path: "packages/a/package.json",
        name: "postinstall",
        command: "node a.js",
      },
      { path: "packages/a/package.json", name: "preprepare", command: "x" },
      {
        path: "packages/b/composer.json",
        name: "pre-autoload-dump",
        command: "@php b",
      },
    ]);
    expect(result.entryPoints).toEqual([]);
  });

  it("recognises postprepare as an npm hook", () => {
    const result = hints({
      "package.json": JSON.stringify({ scripts: { postprepare: "p" } }),
    });

    expect(result.installHooks).toEqual([
      { path: "package.json", name: "postprepare", command: "p" },
    ]);
  });

  it("reports the plugin, package and dependencies events as hooks, not entry points", () => {
    const result = hints({
      "package.json": JSON.stringify({ scripts: { dependencies: "d" } }),
      "composer.json": JSON.stringify({
        scripts: {
          command: "c",
          "pre-package-update": "a",
          "post-package-update": "b",
          "pre-package-uninstall": "e",
          "post-package-uninstall": "f",
          "post-file-download": "g",
        },
      }),
    });

    expect(result.entryPoints).toEqual([]);
    expect(result.installHooks).toEqual([
      { path: "composer.json", name: "command", command: "c" },
      { path: "composer.json", name: "post-file-download", command: "g" },
      { path: "composer.json", name: "post-package-uninstall", command: "f" },
      { path: "composer.json", name: "post-package-update", command: "b" },
      { path: "composer.json", name: "pre-package-uninstall", command: "e" },
      { path: "composer.json", name: "pre-package-update", command: "a" },
      { path: "package.json", name: "dependencies", command: "d" },
    ]);
  });

  it("skips a manifest that is not valid JSON", () => {
    const result = hints({ "package.json": "{", "composer.lock": "{}\n" });

    expect(result.lockfiles).toHaveLength(1);
    expect(result.entryPoints).toEqual([]);
    expect(result.installHooks).toEqual([]);
  });

  describe("hook lists", () => {
    it.each(npmHooks)("lists the npm hook %s", (name) => {
      const result = hints({
        "package.json": JSON.stringify({ scripts: { [name]: "x" } }),
      });

      expect(result.installHooks).toEqual([
        { path: "package.json", name, command: "x" },
      ]);
      expect(result.entryPoints).toEqual([]);
    });

    it.each(composerHooks)("lists the composer hook %s", (name) => {
      const result = hints({
        "composer.json": JSON.stringify({ scripts: { [name]: "x" } }),
      });

      expect(result.installHooks).toEqual([
        { path: "composer.json", name, command: "x" },
      ]);
      expect(result.entryPoints).toEqual([]);
    });
  });
});
