import { describe, expect, it } from "vitest";
import { hints, registerSandbox } from "./helpers.ts";

registerSandbox();

describe("install-hints.mjs", () => {
  it("lists make targets but not assignments or special targets", () => {
    const result = hints({
      Makefile: [
        "INSTALL := x",
        ".PHONY: install setup",
        "install:",
        "\t@true",
        "install-deps: ; @true",
        "build:",
        "setup::",
        "",
      ].join("\n"),
    });

    expect(result.entryPoints).toEqual([
      {
        path: "Makefile",
        kind: "make",
        names: ["install", "install-deps", "setup"],
      },
    ]);
    expect(result.tools).toEqual([{ name: "make", onPath: false }]);
  });

  it("lists just recipes and Taskfile tasks with install-like names", () => {
    const result = hints({
      justfile: "version := '1'\nsetup arg:\n  echo\nbuild:\n  echo\n",
      "Taskfile.yml":
        "version: '3'\ntasks:\n  install:\n    cmds: []\n  build:\n    cmds: []\nother:\n  setup:\n",
    });

    expect(result.entryPoints).toEqual([
      { path: "Taskfile.yml", kind: "task", names: ["install"] },
      { path: "justfile", kind: "just", names: ["setup"] },
    ]);
  });

  it("lists composer and npm scripts with install-like names, hooks separately", () => {
    const result = hints({
      "package.json": JSON.stringify({
        scripts: { setup: "node s.js", build: "x", postinstall: "node x.js" },
      }),
      "composer.json": JSON.stringify({
        scripts: { "post-install-cmd": ["@php a", "@php b"] },
      }),
    });

    expect(result.entryPoints).toEqual([
      { path: "package.json", kind: "npm-script", names: ["setup"] },
    ]);
    expect(result.installHooks).toEqual([
      {
        path: "composer.json",
        name: "post-install-cmd",
        command: "@php a && @php b",
      },
      { path: "package.json", name: "postinstall", command: "node x.js" },
    ]);
  });

  it("lists init headings in docs", () => {
    const result = hints({ "README.md": "# T\n## Init the project\n" });

    expect(result.entryPoints).toEqual([
      { path: "README.md", kind: "docs-section", names: ["Init the project"] },
    ]);
  });

  it("lists docs headings about installing", () => {
    const result = hints({
      "README.md":
        "# T\n## Installation\n### Getting started\n## Usage\n```\n# setup comment\n```\n",
    });

    expect(result.entryPoints).toEqual([
      {
        path: "README.md",
        kind: "docs-section",
        names: ["Getting started", "Installation"],
      },
    ]);
  });

  it("lists setup script files", () => {
    const result = hints({ "bin/setup": "#!/bin/sh\n" });

    expect(result.entryPoints).toEqual([
      { path: "bin/setup", kind: "script-file", names: [] },
    ]);
  });
});
