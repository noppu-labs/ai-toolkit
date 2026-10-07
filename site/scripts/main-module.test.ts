import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { isMainModule } from "./main-module.ts";

const dir = mkdtempSync(join(tmpdir(), "main-module-test-"));
const script = join(dir, "script.ts");
const other = join(dir, "other.ts");
writeFileSync(script, "");
writeFileSync(other, "");
symlinkSync(dir, join(dir, "link"));
const scriptUrl: string = pathToFileURL(script).href;

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("isMainModule", () => {
  it("matches the entry script", () => {
    expect(isMainModule(scriptUrl, script)).toBe(true);
  });

  it("matches the entry script reached through a symlinked directory", () => {
    expect(isMainModule(scriptUrl, join(dir, "link", "script.ts"))).toBe(true);
  });

  it("rejects another script, a missing entry and no entry", () => {
    expect(isMainModule(scriptUrl, other)).toBe(false);
    expect(isMainModule(scriptUrl, join(dir, "missing.ts"))).toBe(false);
    expect(isMainModule(scriptUrl, undefined)).toBe(false);
  });
});
