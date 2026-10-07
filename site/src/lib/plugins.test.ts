import { describe, expect, it } from "vitest";
import catalog from "../generated/catalog.json";
import {
  isLanguageAgnostic,
  PLUGIN_ORDER,
  pluginColorClass,
  pluginColorVar,
  pluginPressedColorClass,
  sortPlugins,
  sortSkills,
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

describe("sortSkills", () => {
  it("leads review with the orchestrator, then the skills it runs", () => {
    const sorted = sortSkills(
      "review",
      named(
        "comment-audit",
        "pr-comments",
        "pr-review",
        "type-safety-review",
        "writing-comments",
      ),
    );
    expect(sorted.map((s) => s.name)).toEqual([
      "pr-review",
      "comment-audit",
      "type-safety-review",
      "pr-comments",
      "writing-comments",
    ]);
  });

  it("sorts other plugins' skills, and review's unknown ones, by name", () => {
    expect(
      sortSkills("laravel", named("laravel-enums", "laravel-dtos")).map(
        (s) => s.name,
      ),
    ).toEqual(["laravel-dtos", "laravel-enums"]);
    expect(
      sortSkills("review", named("zz-new", "pr-review", "aa-new")).map(
        (s) => s.name,
      ),
    ).toEqual(["pr-review", "aa-new", "zz-new"]);
  });

  it("puts pr-review first in the real catalog", () => {
    const review = catalog.plugins.find((p) => p.name === "review");
    expect(sortSkills("review", review?.skills ?? [])[0]?.name).toBe(
      "pr-review",
    );
  });
});

describe("plugin colours", () => {
  it("names each plugin's accent as a CSS value, main for unknown ones", () => {
    const resolve = (value: string): string => {
      const element = document.createElement("div");
      element.style.backgroundColor = value;
      document.body.append(element);
      const color = getComputedStyle(element).backgroundColor;
      element.remove();
      return color;
    };

    expect(resolve(pluginColorVar("investigate"))).toBe(
      resolve("var(--color-plugin-investigate)"),
    );
    expect(resolve(pluginColorVar("investigate"))).not.toBe(
      resolve("var(--color-main)"),
    );
    expect(resolve(pluginColorVar("unknown"))).toBe(
      resolve("var(--color-main)"),
    );
  });

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
