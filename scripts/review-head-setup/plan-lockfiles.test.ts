import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  headsOf,
  type Json,
  makeFixture,
  plan,
  registerSandbox,
  write,
} from "./helpers.ts";

registerSandbox();

describe("head-setup.mjs", () => {
  describe("plan lockfiles", () => {
    const managers: [string, string, string, string][] = [
      ["composer", "composer.lock", "vendor", "dir"],
      ["npm", "package-lock.json", "node_modules", "dir"],
      ["pnpm", "pnpm-lock.yaml", "node_modules", "dir"],
      ["yarn", "yarn.lock", "node_modules", "dir"],
      ["yarn", "yarn.lock", ".pnp.cjs", "file"],
      ["bun", "bun.lock", "node_modules", "dir"],
      ["bun", "bun.lockb", "node_modules", "dir"],
      ["uv", "uv.lock", ".venv", "dir"],
      ["poetry", "poetry.lock", ".venv", "dir"],
    ];

    it.each(managers)(
      "reports a changed %s lockfile (%s) and its %s",
      (manager, lockfile, dependency, shape) => {
        const { dir, head } = makeFixture(
          { [lockfile]: "1\n" },
          { [lockfile]: "2\n" },
        );
        const read = (): Json | undefined =>
          headsOf({
            status: 0,
            json: plan(dir, head),
            stderr: "",
          })[0];

        expect(read()?.lockfiles).toEqual([
          { path: lockfile, manager, changed: true, dependencies: "missing" },
        ]);

        if (shape === "dir") {
          mkdirSync(join(dir, dependency));
        } else {
          write(dir, dependency, "x\n");
        }

        expect(read()?.lockfiles).toEqual([
          { path: lockfile, manager, changed: true, dependencies: "present" },
        ]);
      },
    );

    it("never offers a lockfile whose directory tracks an install directory as a symlink", () => {
      const { dir, head } = makeFixture(
        { "web/package-lock.json": "1\n", "api/composer.lock": "1\n" },
        { "web/package-lock.json": "2\n", "api/composer.lock": "2\n" },
        { links: { "web/node_modules": "/tmp/elsewhere" } },
      );
      const lockfiles = headsOf({
        status: 0,
        json: plan(dir, head),
        stderr: "",
      })[0]?.lockfiles;

      expect(lockfiles).toEqual([
        {
          path: "api/composer.lock",
          manager: "composer",
          changed: true,
          dependencies: "missing",
        },
      ]);
    });

    it.each([
      ["bundler", "Gemfile.lock"],
      ["go", "go.sum"],
    ])("never claims to know the %s dependencies", (manager, lockfile) => {
      const { dir, head } = makeFixture(
        { [lockfile]: "1\n" },
        { [lockfile]: "2\n" },
      );

      expect(
        headsOf({ status: 0, json: plan(dir, head), stderr: "" })[0]?.lockfiles,
      ).toEqual([
        { path: lockfile, manager, changed: true, dependencies: "unknown" },
      ]);
    });

    it("marks a lockfile unchanged, or new when the current commit has none", () => {
      const { dir, head } = makeFixture(
        { "package-lock.json": "1\n" },
        { "b.txt": "b\n", "composer.lock": "{}\n" },
      );
      const lockfiles = headsOf({
        status: 0,
        json: plan(dir, head),
        stderr: "",
      })[0]?.lockfiles;

      expect(lockfiles).toEqual([
        {
          path: "composer.lock",
          manager: "composer",
          changed: true,
          dependencies: "missing",
        },
        {
          path: "package-lock.json",
          manager: "npm",
          changed: false,
          dependencies: "missing",
        },
      ]);
    });

    it("checks the directory next to a nested lockfile", () => {
      const { dir, head } = makeFixture(
        { "web/package-lock.json": "1\n" },
        { "web/package-lock.json": "2\n" },
      );

      mkdirSync(join(dir, "node_modules"));

      const first = headsOf({ status: 0, json: plan(dir, head), stderr: "" })[0]
        ?.lockfiles;

      mkdirSync(join(dir, "web", "node_modules"));

      const second = headsOf({
        status: 0,
        json: plan(dir, head),
        stderr: "",
      })[0]?.lockfiles;

      expect(first).toMatchObject([{ dependencies: "missing" }]);
      expect(second).toMatchObject([{ dependencies: "present" }]);
    });

    it("does not list a symlinked or unsafe lockfile path", () => {
      const { dir, head } = makeFixture(
        {},
        {
          "pnpm-lock.yaml": "x\n",
          "we$ird/composer.lock": "x\n",
          "-dash/yarn.lock": "x\n",
        },
        { links: { "package-lock.json": "pnpm-lock.yaml" } },
      );
      const lockfiles = headsOf({
        status: 0,
        json: plan(dir, head),
        stderr: "",
      })[0]?.lockfiles;

      expect(lockfiles).toMatchObject([{ path: "pnpm-lock.yaml" }]);
      expect(lockfiles).toHaveLength(1);
    });
  });
});
