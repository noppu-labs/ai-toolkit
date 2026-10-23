import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  makeSkillId,
  NAMESPACES,
} from "../packages/opencode-toolkit-core/naming.ts";

describe("makeSkillId", () => {
  it("leaves review skills bare", () => {
    expect(makeSkillId("review", "pr-review")).toBe("pr-review");
  });

  it("prefixes investigate skills with the namespace", () => {
    expect(makeSkillId("investigate", "brief")).toBe("investigate-brief");
  });

  it("throws for an unlisted namespace", () => {
    expect(() => makeSkillId("laravel", "x")).toThrow(
      /Unknown skill namespace laravel/,
    );
  });

  it("joins other listed namespaces with a dash and never a colon", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NAMESPACES.filter((ns: string) => ns !== "review")),
        fc.stringMatching(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        (namespace: string, skill: string) => {
          const id: string = makeSkillId(namespace, skill);

          expect(id).toBe(`${namespace}-${skill}`);
          expect(id).not.toContain(":");
        },
      ),
    );
  });
});
