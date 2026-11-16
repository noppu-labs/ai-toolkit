import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pluginPath, skillPath, skillShareUrl } from "./site.ts";

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
