import { describe, expect, it } from "vitest";
import { hints, lockfileCases, registerSandbox } from "./helpers.ts";

registerSandbox();

describe("install-hints.mjs", () => {
  it.each(lockfileCases)(
    "maps %s to its manager and command",
    (file, extra, manager, likelyCommand) => {
      const result = hints({ [file]: "x\n", ...extra });

      expect(result.lockfiles).toEqual([
        { path: file, manager, likelyCommand },
      ]);
    },
  );

  it("lists nested lockfiles but not vendored ones", () => {
    const result = hints({
      "frontend/package-lock.json": "{}\n",
      "vendor/acme/x/composer.lock": "{}\n",
      "node_modules/y/package-lock.json": "{}\n",
    });

    expect(result.lockfiles).toEqual([
      {
        path: "frontend/package-lock.json",
        manager: "npm",
        likelyCommand: "npm ci",
      },
    ]);
  });
});
