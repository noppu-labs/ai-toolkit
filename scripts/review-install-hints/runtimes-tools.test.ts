import { describe, expect, it } from "vitest";
import { hints, makeBin, registerSandbox } from "./helpers.ts";

registerSandbox();

describe("install-hints.mjs", () => {
  it("reads runtime pins", () => {
    const result = hints({
      ".nvmrc": "22\n",
      ".tool-versions": "php 8.4.1\nnodejs 22.1.0\n",
      "composer.json": JSON.stringify({ require: { php: "^8.4" } }),
    });

    expect(result.runtimes).toEqual([
      { path: ".nvmrc", tool: "node", version: "22" },
      { path: ".tool-versions", tool: "nodejs", version: "22.1.0" },
      { path: ".tool-versions", tool: "php", version: "8.4.1" },
      { path: "composer.json", tool: "php", version: "^8.4" },
    ]);
  });

  it("reads engines.node from package.json", () => {
    const result = hints({
      "package.json": JSON.stringify({ engines: { node: ">=22" } }),
    });

    expect(result.runtimes).toEqual([
      { path: "package.json", tool: "node", version: ">=22" },
    ]);
  });

  it("reports which implied tools are on PATH", () => {
    const result = hints(
      { "composer.lock": "{}\n", "pnpm-lock.yaml": "x\n" },
      makeBin(["composer"]),
    );

    expect(result.tools).toEqual([
      { name: "composer", onPath: true },
      { name: "pnpm", onPath: false },
    ]);
  });
});
