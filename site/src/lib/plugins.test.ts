import { describe, expect, it } from "vitest";
import catalog from "../generated/catalog.json";
import {
  isLanguageAgnostic,
  PLUGIN_ORDER,
  pluginColorClass,
  pluginPressedColorClass,
  sortPlugins,
} from "./plugins.ts";

const named = (...names: string[]): { name: string }[] =>
  names.map((name) => ({ name }));

describe("PLUGIN_ORDER", () => {
  it("names every catalog plugin", () => {
    expect([...PLUGIN_ORDER].sort()).toEqual(
      catalog.plugins.map((plugin) => plugin.name).sort(),
    );
  });
});

describe("sortPlugins", () => {
  it("puts the known plugins in the site order", () => {
    const sorted = sortPlugins(
      named("inertia-react", "laravel", "investigate", "review"),
    );
    expect(sorted.map((p) => p.name)).toEqual([...PLUGIN_ORDER]);
  });

  it("keeps unknown plugins after the known ones, in input order", () => {
    const sorted = sortPlugins(
      named("zeta", "laravel", "alpha", "review", "mid"),
    );
    expect(sorted.map((p) => p.name)).toEqual([
      "review",
      "laravel",
      "zeta",
      "alpha",
      "mid",
    ]);
  });

  it("does not mutate its input", () => {
    const input = named("laravel", "review");
    sortPlugins(input);
    expect(input.map((p) => p.name)).toEqual(["laravel", "review"]);
  });
});

describe("plugin colours", () => {
  it("maps each known plugin to its accent and unknown ones to main", () => {
    expect(pluginColorClass("review")).toBe("bg-plugin-review");
    expect(pluginColorClass("investigate")).toBe("bg-plugin-investigate");
    expect(pluginColorClass("laravel")).toBe("bg-plugin-laravel");
    expect(pluginColorClass("inertia-react")).toBe("bg-plugin-inertia-react");
    expect(pluginColorClass("unknown")).toBe("bg-main");
  });

  it("maps pressed toggles to the same accent", () => {
    expect(pluginPressedColorClass("laravel")).toContain(
      "data-pressed:bg-plugin-laravel",
    );
    expect(pluginPressedColorClass("unknown")).toContain(
      "data-pressed:bg-main",
    );
  });
});

describe("isLanguageAgnostic", () => {
  it("is true only for review and investigate", () => {
    expect(isLanguageAgnostic("review")).toBe(true);
    expect(isLanguageAgnostic("investigate")).toBe(true);
    expect(isLanguageAgnostic("laravel")).toBe(false);
    expect(isLanguageAgnostic("inertia-react")).toBe(false);
  });
});
