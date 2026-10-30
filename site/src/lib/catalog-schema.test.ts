import type { z } from "astro/zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Catalog } from "@/catalog-types";
import { FIXTURE_CATALOG } from "@/test/fixture-catalog";
import { catalogSchema } from "./catalog-schema.ts";

describe("catalogSchema", () => {
  it("types exactly what the site consumes", () => {
    expectTypeOf<z.infer<typeof catalogSchema>>().toEqualTypeOf<Catalog>();
  });

  it("accepts the fixture catalog unchanged", () => {
    expect(catalogSchema.parse(FIXTURE_CATALOG)).toEqual(FIXTURE_CATALOG);
  });

  it("rejects a skill with an empty name", () => {
    const broken = structuredClone(FIXTURE_CATALOG);
    const skill = broken.plugins[0]?.skills[0];
    if (skill === undefined) {
      throw new Error("fixture has no skill");
    }
    skill.name = "";
    expect(() => catalogSchema.parse(broken)).toThrow();
  });
});
