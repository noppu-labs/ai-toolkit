import { describe, expect, it } from "vitest";
import { CACHE_MANAGER_PLUGIN, REVIEWER_PLUGIN } from "@/test/opencode-plugins";
import type { PluginEntry } from "../catalog-types.ts";
import {
  FIXTURE_CATALOG,
  FIXTURE_REVIEW_PLUGIN,
} from "../test/fixture-catalog.ts";
import { openCodeCard, toolkitOpenCodeCards } from "./opencode-cards.ts";

describe("openCodeCard", () => {
  it("takes the summary, chips, first install command, page link and accent", () => {
    expect(openCodeCard(REVIEWER_PLUGIN, false)).toEqual({
      name: "opencode-permission-reviewer",
      version: "3.4.1",
      summary: REVIEWER_PLUGIN.page.summary,
      chips: ["OpenCode V1 + V2", "TUI overlay", "runs headless", "audit log"],
      command: "opencode plugin add @noppu-labs/opencode-permission-reviewer",
      href: "/opencode/opencode-permission-reviewer",
      accentClass: "bg-plugin-opencode-permission-reviewer",
    });
  });

  it("leaves the image out unless asked for it", () => {
    expect(openCodeCard(CACHE_MANAGER_PLUGIN, false)).not.toHaveProperty(
      "image",
    );
  });

  it("adds the hero image, at its size and with its alt text, when asked", () => {
    expect(openCodeCard(CACHE_MANAGER_PLUGIN, true).image).toEqual({
      src: "/_astro/social-preview.png",
      width: 1280,
      height: 640,
      alt: CACHE_MANAGER_PLUGIN.page.image.alt,
    });
  });
});

describe("toolkitOpenCodeCards", () => {
  const plugins: PluginEntry[] = [
    ...FIXTURE_CATALOG.plugins,
    FIXTURE_REVIEW_PLUGIN,
  ];

  it("gives a card to each plugin with an OpenCode package, and skips the rest", () => {
    expect(toolkitOpenCodeCards(plugins)).toEqual([
      {
        name: "review",
        description: FIXTURE_REVIEW_PLUGIN.description,
        skillCount: 1,
        packageName: "@noppu-labs/opencode-review",
        command: "opencode plugin add @noppu-labs/opencode-review",
        skillsHref: "/?plugin=review#skills",
        accentClass: "bg-plugin-review",
      },
    ]);
  });

  it("lists the cards in the site's plugin order", () => {
    const investigate: PluginEntry = {
      ...FIXTURE_REVIEW_PLUGIN,
      name: "investigate",
      opencodePackage: "@noppu-labs/opencode-investigate",
    };

    const cards = toolkitOpenCodeCards([investigate, ...plugins]);

    expect(cards.map((card) => card.name)).toEqual(["review", "investigate"]);
    expect(cards[1]).toMatchObject({
      command: "opencode plugin add @noppu-labs/opencode-investigate",
      skillsHref: "/?plugin=investigate#skills",
    });
  });
});
