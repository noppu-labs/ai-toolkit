import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCatalog } from "./build-catalog.ts";

let root = "";

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "catalog-test-"));
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(dir, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: "ai-toolkit",
      description: "Test marketplace",
      plugins: [{ name: "demo", source: "./demo", description: "Demo plugin" }],
    }),
  );
  mkdirSync(join(dir, "demo", ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(dir, "demo", ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "demo", version: "1.2.3" }),
  );
  mkdirSync(join(dir, "demo", "skills", "alpha"), { recursive: true });
  writeFileSync(
    join(dir, "demo", "skills", "alpha", "SKILL.md"),
    "---\nname: alpha\ndescription: First skill\n---\n\n# Alpha\n",
  );
  mkdirSync(join(dir, "demo", "agents"), { recursive: true });
  writeFileSync(join(dir, "demo", "agents", "helper.md"), "# agent\n");
  return dir;
}

afterEach(() => {
  if (root !== "") {
    rmSync(root, { recursive: true, force: true });
    root = "";
  }
});

describe("buildCatalog", () => {
  it("builds the catalog from manifests and SKILL.md frontmatter", () => {
    root = makeRepo();
    const catalog = buildCatalog(root);

    expect(catalog.marketplaceName).toBe("ai-toolkit");
    expect(catalog.marketplaceDescription).toBe("Test marketplace");
    expect(catalog.plugins).toHaveLength(1);

    const plugin = catalog.plugins[0];
    expect(plugin).toMatchObject({
      name: "demo",
      description: "Demo plugin",
      version: "1.2.3",
      agentCount: 1,
      ruleCount: 0,
    });
    expect(plugin?.skills).toEqual([
      {
        name: "alpha",
        description: "First skill",
        sourceUrl:
          "https://github.com/noppu-labs/ai-toolkit/blob/main/demo/skills/alpha/SKILL.md",
      },
    ]);
  });

  it("throws when a SKILL.md is missing required frontmatter fields", () => {
    root = makeRepo();
    writeFileSync(
      join(root, "demo", "skills", "alpha", "SKILL.md"),
      "---\nname: alpha\n---\n",
    );
    expect(() => buildCatalog(root)).toThrow(/description/);
    expect(() => buildCatalog(root)).toThrow(/alpha/);
  });

  it("throws when a skill directory has no SKILL.md", () => {
    root = makeRepo();
    mkdirSync(join(root, "demo", "skills", "empty"), { recursive: true });
    expect(() => buildCatalog(root)).toThrow(/empty/);
  });

  it("builds the real repository catalog without throwing", () => {
    const realRoot = join(import.meta.dirname, "..", "..");
    const catalog = buildCatalog(realRoot);
    expect(catalog.plugins.map((p) => p.name)).toEqual([
      "laravel",
      "inertia-react",
    ]);
    const laravel = catalog.plugins[0];
    expect(laravel?.skills.length).toBeGreaterThanOrEqual(16);
  });
});
