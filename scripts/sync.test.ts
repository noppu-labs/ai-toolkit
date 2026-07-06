import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

describe("sync entrypoint", () => {
  // sync.ts runs on import, so swap argv first and import it dynamically.
  // Verify runs against this repo's real lock files — the same invariant the
  // quality workflow enforces with `npm run sync -- verify`.
  it("resolves the repo root and dispatches argv on import", async (t) => {
    const logs: string[] = [];
    const originalArgv = process.argv;

    vi.spyOn(console, "log").mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
    vi.spyOn(process, "exit").mockImplementation(
      (code?: string | number | null): never => {
        throw new Error(`process.exit(${code})`);
      },
    );
    process.argv = ["node", "sync.ts", "verify"];

    t.onTestFinished(() => {
      process.argv = originalArgv;
      vi.restoreAllMocks();
    });

    await import("./sync.ts");

    expect(logs).toContain("skills-lock.json and skills/ are consistent");
  });

  it("exits 2 with usage when run as a subprocess with an unknown command", () => {
    const result = spawnSync(
      "node_modules/.bin/tsx",
      ["scripts/sync.ts", "bogus"],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage: skills-sync");
  });
});
