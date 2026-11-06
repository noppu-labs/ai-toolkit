import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openCodeCard } from "@/lib/opencode-cards";
import { CACHE_MANAGER_PLUGIN, REVIEWER_PLUGIN } from "@/test/opencode-plugins";
import { OpenCodeSection } from "./OpenCodeSection.tsx";

const CARDS = [REVIEWER_PLUGIN, CACHE_MANAGER_PLUGIN].map((plugin) =>
  openCodeCard(plugin, false),
);

describe("OpenCodeSection", () => {
  it("is the home page's third section, with its eyebrow and heading", async () => {
    render(<OpenCodeSection cards={CARDS} />);

    await expect.element(page.getByText("03 — OpenCode")).toBeVisible();
    await expect
      .element(page.getByRole("heading", { level: 2 }))
      .toHaveTextContent("Plugins for OpenCode.");
    expect(document.querySelector("section")?.id).toBe("opencode");
  });

  it("shows one card per plugin, with no image", async () => {
    render(<OpenCodeSection cards={CARDS} />);

    await expect
      .element(
        page.getByRole("heading", { level: 3, name: CARDS[0]?.name ?? "" }),
      )
      .toBeVisible();
    expect(page.getByRole("article").elements()).toHaveLength(2);
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });

  it("links to the hub, and names review and investigate in the band", async () => {
    render(<OpenCodeSection cards={CARDS} />);

    await expect
      .element(page.getByRole("link", { name: /All OpenCode plugins/ }))
      .toHaveAttribute("href", "/opencode");
    await expect
      .element(page.getByText(/install on OpenCode too\./))
      .toBeVisible();
  });
});
