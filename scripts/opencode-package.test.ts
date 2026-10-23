import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, Skill } from "@opencode/plugin";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSkillId } from "../packages/opencode-toolkit-core/naming.ts";

type PackFile = { path: string };

type PackResult = { files: PackFile[] };

type SkillEditor = Parameters<
  Parameters<Plugin.Context["skill"]["transform"]>[0]
>[0];

const REPO_ROOT: string = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

const PLUGIN_PACKAGES: readonly string[] = ["review"];

const SHARED_PACKAGES: readonly string[] = ["packages/opencode-toolkit-core"];

const INSTALL_FLAGS: readonly string[] = [];

const CORE_NAME = "@noppu-labs/opencode-toolkit-core";

const SHARED_FILES: readonly string[] = [
  "package.json",
  "README.md",
  "LICENSE",
  "index.ts",
  "naming.ts",
  "load-skills.ts",
];

const LOCKFILES: readonly string[] = [
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "yarn.lock",
];

const temporaryDirs: string[] = [];

function getPackageDir(relative: string): string {
  return resolve(REPO_ROOT, relative);
}

function readManifest(dir: string): {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

function listSkillIds(root: string): string[] {
  return readdirSync(join(root, "skills"), { withFileTypes: true })
    .filter((entry): boolean => entry.isDirectory())
    .map((entry): string => entry.name)
    .sort();
}

function readPackedPaths(dir: string): string[] {
  const output: string = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts", "--workspaces=false"],
    { cwd: dir, encoding: "utf8" },
  );
  const results: PackResult[] = JSON.parse(output);

  return (results[0]?.files ?? []).map((file: PackFile): string => file.path);
}

// Hand-written ^ semantics for 0.x ranges (same major and minor, patch at or
// above the floor), so the test needs no semver dependency.
function isCaretRangeSatisfied(range: string, version: string): boolean {
  const match: RegExpMatchArray | null = range.match(/^\^(\d+)\.(\d+)\.(\d+)$/);

  if (match === null) {
    return false;
  }

  const [major, minor, patch]: number[] = match.slice(1).map(Number);
  const [vMajor, vMinor, vPatch]: number[] = version.split(".").map(Number);

  return major === vMajor && minor === vMinor && (vPatch ?? 0) >= (patch ?? 0);
}

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("isCaretRangeSatisfied", () => {
  it("accepts the same minor at or above the floor patch", () => {
    expect(isCaretRangeSatisfied("^0.1.0", "0.1.0")).toBe(true);
    expect(isCaretRangeSatisfied("^0.1.0", "0.1.4")).toBe(true);
  });

  it("rejects another minor, another major or a lower patch", () => {
    expect(isCaretRangeSatisfied("^0.1.2", "0.1.1")).toBe(false);
    expect(isCaretRangeSatisfied("^0.1.0", "0.2.0")).toBe(false);
    expect(isCaretRangeSatisfied("^0.1.0", "1.1.0")).toBe(false);
    expect(isCaretRangeSatisfied("latest", "0.1.0")).toBe(false);
  });
});

describe("npm package contents", () => {
  for (const relative of PLUGIN_PACKAGES) {
    describe(relative, () => {
      const dir: string = getPackageDir(relative);

      it("ships the plugin, the skills and the docs, and nothing Claude-only", () => {
        const paths: string[] = readPackedPaths(dir);

        for (const required of [
          "package.json",
          "README.md",
          "LICENSE",
          "opencode/index.ts",
          ...listSkillIds(dir).map(
            (id: string): string => `skills/${id}/SKILL.md`,
          ),
        ]) {
          expect(paths).toContain(required);
        }

        expect(paths).not.toContain("opencode/load-skills.ts");

        for (const path of paths) {
          expect(path).not.toMatch(/^(hooks|workflows|\.claude-plugin)\//);
          expect(path).not.toMatch(/skills-lock\.json|\.lock/);
        }
      });

      it("matches the Claude plugin version", () => {
        const plugin: { version: string } = JSON.parse(
          readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8"),
        );

        expect(readManifest(dir).version).toBe(plugin.version);
      });

      it("depends on a shared loader version the repo provides", () => {
        const range: string | undefined =
          readManifest(dir).dependencies?.[CORE_NAME];
        const core: string = readManifest(
          getPackageDir(SHARED_PACKAGES[0] ?? ""),
        ).version;

        expect(range).toBeDefined();
        expect(isCaretRangeSatisfied(range ?? "", core)).toBe(true);
      });
    });
  }

  for (const relative of SHARED_PACKAGES) {
    it(`${relative} ships exactly the loader sources and the docs`, () => {
      expect(readPackedPaths(getPackageDir(relative)).sort()).toEqual(
        [...SHARED_FILES].sort(),
      );
    });
  }

  it("has no lockfile, which would make Claude Code run npm install", () => {
    for (const relative of [...PLUGIN_PACKAGES, ...SHARED_PACKAGES]) {
      for (const name of LOCKFILES) {
        expect(existsSync(join(getPackageDir(relative), name))).toBe(false);
      }
    }
  });
});

// Local run: pack both packages into a scratch dir, then
// OPENCODE_PACKAGE_DIR=review OPENCODE_TARBALL=<plugin.tgz> OPENCODE_CORE_TARBALL=<core.tgz>.
// The core package may not be on the registry yet, so the install lists its
// tarball explicitly. Verified locally (2026-10-23): that works with no extra
// flag while 0.1.0 is unpublished, so --offline was not needed; if npm ever
// contacts the registry for it, add "--offline" to INSTALL_FLAGS.
describe("installed tarballs", () => {
  const packageDir: string = (process.env.OPENCODE_PACKAGE_DIR ?? "").replace(
    /\/+$/,
    "",
  );
  const tarball: string = process.env.OPENCODE_TARBALL ?? "";
  const coreTarball: string = process.env.OPENCODE_CORE_TARBALL ?? "";
  const isShared: boolean = SHARED_PACKAGES.includes(packageDir);

  it("registers the skills from the installed tarballs", {
    skip: !tarball,
    timeout: 300_000,
  }, async () => {
    expect(
      [...PLUGIN_PACKAGES, ...SHARED_PACKAGES],
      "OPENCODE_PACKAGE_DIR must be a known package dir",
    ).toContain(packageDir);

    if (!isShared) {
      expect(coreTarball, "OPENCODE_CORE_TARBALL required").not.toBe("");
    }

    const project: string = realpathSync(
      mkdtempSync(join(tmpdir(), "opencode-smoke-")),
    );

    temporaryDirs.push(project);
    writeFileSync(join(project, "package.json"), '{"private":true}');
    execFileSync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        ...INSTALL_FLAGS,
        ...(isShared ? [tarball] : [coreTarball, tarball]),
      ],
      { cwd: project, stdio: "pipe" },
    );

    const name: string = readManifest(getPackageDir(packageDir)).name;
    const installed: string = realpathSync(join(project, "node_modules", name));

    if (isShared) {
      const core: { makePlugin: unknown } = await import(
        join(installed, "index.ts")
      );

      expect(core.makePlugin).toBeTypeOf("function");

      return;
    }

    const loaded: { default: Plugin.Plugin } = await import(
      join(installed, "opencode", "index.ts")
    );
    const added: Skill.Info[] = [];
    let captured: ((editor: SkillEditor) => void) | undefined;
    // The plugin only touches ctx.skill.transform, so a partial context stands in for the full one.
    const ctx = {
      skill: {
        transform: vi.fn(async (callback: (editor: SkillEditor) => void) => {
          captured = callback;

          return { dispose: async (): Promise<void> => {} };
        }),
      },
    } as unknown as Plugin.Context;

    await loaded.default.setup(ctx);
    // Only get and add are exercised, so the other editor methods are left out.
    captured?.({
      get: (): undefined => undefined,
      add: (skill: Skill.Info): void => {
        added.push(skill);
      },
    } as unknown as SkillEditor);

    const namespace: string = basename(packageDir);

    expect(added.map((skill: Skill.Info): string => skill.id)).toEqual(
      listSkillIds(installed).map((id: string): string =>
        makeSkillId(namespace, id),
      ),
    );

    for (const skill of added) {
      expect(skill.path.startsWith(installed + sep)).toBe(true);
    }
  });
});
