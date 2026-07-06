import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, type TestContext, vi } from "vitest";
import { runMain } from "./cli.ts";
import { hashDirectory } from "./hashing.ts";
import { readLock } from "./lockfile.ts";
import { addSkill, makeRoot, requireEntry } from "./test-helpers.ts";

interface CapturedIo {
  logs: string[];
  errors: string[];
  exits: (string | number | null | undefined)[];
}

// runMain talks to the process (console, exit codes), so capture both and
// turn process.exit into a throw to stop execution the way the real one does.
function captureIo(t: TestContext): CapturedIo {
  const logs: string[] = [];
  const errors: string[] = [];
  const exits: (string | number | null | undefined)[] = [];

  vi.spyOn(console, "log").mockImplementation((message: unknown) => {
    logs.push(String(message));
  });
  vi.spyOn(console, "error").mockImplementation((message: unknown) => {
    errors.push(String(message));
  });
  vi.spyOn(process, "exit").mockImplementation(
    (code?: string | number | null): never => {
      exits.push(code);

      throw new Error(`process.exit(${code})`);
    },
  );

  t.onTestFinished(() => {
    vi.restoreAllMocks();
  });

  return { logs, errors, exits };
}

describe("runMain", () => {
  it("prints usage and exits 2 for an unknown command", (t) => {
    const io = captureIo(t);

    expect(() => runMain("/nowhere", ["bogus"])).toThrow(/process.exit\(2\)/);
    expect(io.errors[0]).toContain("usage: skills-sync");
    expect(io.exits[0]).toBe(2);
  });

  it("verify reports a consistent tree", (t) => {
    const io = captureIo(t);
    const root = makeRoot(t);

    runMain(root, ["verify"]);

    expect(io.logs).toContain("skills-lock.json and skills/ are consistent");
    expect(io.exits).toEqual([]);
  });

  it("verify prints each problem and exits 1", (t) => {
    const io = captureIo(t);
    const root = makeRoot(t);

    addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# demo" },
      {
        source: "owner/repo",
        sourceType: "github",
        ref: "main",
        skillPath: "skills/demo",
      },
    );

    expect(() => runMain(root, ["verify"])).toThrow(/process.exit\(1\)/);
    expect(
      io.errors.some((line) => line.includes("missing vendoredHash")),
    ).toBe(true);
    expect(io.exits[0]).toBe(1);
  });

  it("status prints one row per locked skill", (t) => {
    const io = captureIo(t);
    const root = makeRoot(t);

    addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" });
    runMain(root, ["status"]);

    expect(
      io.logs.some(
        (line) => line.startsWith("local") && line.endsWith("laravel/demo"),
      ),
    ).toBe(true);
  });

  it("pull reports the failure and exits 1 for a skill without an upstream", (t) => {
    const io = captureIo(t);
    const root = makeRoot(t);

    addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" });

    expect(() => runMain(root, ["pull", "laravel/demo"])).toThrow(
      /process.exit\(1\)/,
    );
    expect(io.errors.some((line) => line.includes("no github upstream"))).toBe(
      true,
    );
    expect(io.exits[0]).toBe(1);
  });

  it("diff reports the failure and exits 1 for a skill without an upstream", (t) => {
    const io = captureIo(t);
    const root = makeRoot(t);

    addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" });

    expect(() => runMain(root, ["diff", "laravel/demo"])).toThrow(
      /process.exit\(1\)/,
    );
    expect(io.errors.some((line) => line.includes("no github upstream"))).toBe(
      true,
    );
  });

  it("accept re-baselines the vendored hash and reports it", (t) => {
    const io = captureIo(t);
    const root = makeRoot(t);
    const dir = addSkill(root, "laravel", "demo", { "SKILL.md": "# demo" });

    runMain(root, ["accept", "laravel/demo"]);

    expect(io.logs).toContain("re-baselined vendoredHash for laravel/demo");
    expect(requireEntry(readLock(root, "laravel"), "demo").vendoredHash).toBe(
      hashDirectory(dir),
    );
  });

  it("seed without a target seeds every locked skill", (t) => {
    const io = captureIo(t);
    const root = makeRoot(t);

    addSkill(root, "laravel", "one", { "SKILL.md": "# one" });
    addSkill(root, "inertia-react", "two", { "SKILL.md": "# two" });
    runMain(root, ["seed"]);

    expect(io.logs).toContain("seeded laravel/one");
    expect(io.logs).toContain("seeded inertia-react/two");
  });

  it("seed warns when vendored content differs from upstream", (t) => {
    const warnings: string[] = [];

    vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });

    const io = captureIo(t);
    const root = makeRoot(t);
    const binDir = mkdtempSync(join(tmpdir(), "fake-gh-"));
    const originalPath = process.env.PATH;

    t.onTestFinished(() => {
      process.env.PATH = originalPath;
      rmSync(binDir, { recursive: true, force: true });
    });

    // A fake `gh` that serves an upstream whose SKILL.md differs from the
    // vendored copy, so the seed goes through the real fetchUpstream path.
    const upstreamB64 = Buffer.from("# upstream version").toString("base64");

    writeFileSync(
      join(binDir, "gh"),
      [
        "#!/bin/sh",
        'case "$2" in',
        '  *commits*) printf \'{"sha":"abc999"}\' ;;',
        '  *contents*) printf \'[{"type":"file","path":"skills/demo/SKILL.md","sha":"b1"}]\' ;;',
        `  *blobs*) printf '{"content":"${upstreamB64}"}' ;;`,
        "esac",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    process.env.PATH = `${binDir}:${originalPath}`;

    addSkill(
      root,
      "laravel",
      "demo",
      { "SKILL.md": "# local customization" },
      {
        source: "owner/repo",
        sourceType: "github",
        ref: "main",
        skillPath: "skills/demo",
      },
    );
    runMain(root, ["seed", "laravel/demo"]);

    expect(io.logs).toContain("seeded laravel/demo");
    expect(
      warnings.some((line) => line.includes("differs from upstream")),
    ).toBe(true);
  });

  it("seed with a target seeds only that skill", (t) => {
    const io = captureIo(t);
    const root = makeRoot(t);

    addSkill(root, "laravel", "one", { "SKILL.md": "# one" });
    addSkill(root, "laravel", "other", { "SKILL.md": "# other" });
    runMain(root, ["seed", "laravel/one"]);

    expect(io.logs).toContain("seeded laravel/one");
    expect(io.logs).not.toContain("seeded laravel/other");
  });
});
