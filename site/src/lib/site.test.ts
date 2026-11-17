import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  pluginPath,
  pluginSkillsPath,
  skillPath,
  skillShareUrl,
} from "./site.ts";

describe("pluginPath", () => {
  it("is the plugin's page under /plugins", () => {
    expect(pluginPath("inertia-react")).toBe("/plugins/inertia-react");
  });

  it("never yields a second path segment or a trailing slash", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (name) => {
        const path = pluginPath(name);

        expect(path.startsWith("/plugins/")).toBe(true);
        expect(path.slice("/plugins/".length)).not.toContain("/");
      }),
    );
  });
});

describe("pluginSkillsPath", () => {
  it("is the skills section of the plugin's page", () => {
    expect(pluginSkillsPath("inertia-react")).toBe(
      "/plugins/inertia-react#skills",
    );
  });

  it("is the plugin's page plus the skills fragment, whatever the name", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (name) => {
        expect(pluginSkillsPath(name)).toBe(`${pluginPath(name)}#skills`);
      }),
    );
  });
});

describe("skillPath", () => {
  it("is the skill's own page, without a trailing slash", () => {
    expect(skillPath("pr-review")).toBe("/skills/pr-review");
  });

  it("encodes the name", () => {
    expect(skillPath("a b&c")).toBe("/skills/a%20b%26c");
  });
});

describe("skillShareUrl", () => {
  it("links to the skill's page on this origin", () => {
    expect(skillShareUrl("pr-review")).toBe(
      `${window.location.origin}/skills/pr-review`,
    );
  });
});
