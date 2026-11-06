import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openCodeCard } from "@/lib/opencode-cards";
import { CACHE_MANAGER_PLUGIN, REVIEWER_PLUGIN } from "@/test/opencode-plugins";
import { OpenCodeCards } from "./OpenCodeCards.tsx";

const REVIEWER_COMMAND =
  "opencode plugin add @noppu-labs/opencode-permission-reviewer";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OpenCodeCards", () => {
  it("renders a card per plugin with its name, version, summary, chips and command", async () => {
    const cards = [
      openCodeCard(REVIEWER_PLUGIN, true),
      openCodeCard(CACHE_MANAGER_PLUGIN, true),
    ];

    await render(<OpenCodeCards cards={cards} />);

    expect(page.getByRole("article").elements()).toHaveLength(2);
    await expect
      .element(
        page.getByRole("heading", {
          name: "opencode-permission-reviewer",
          exact: true,
        }),
      )
      .toBeVisible();
    await expect
      .element(page.getByText(`v${REVIEWER_PLUGIN.version}`, { exact: true }))
      .toBeVisible();
    await expect.element(page.getByText("TUI overlay")).toBeVisible();
    await expect
      .element(page.getByText(REVIEWER_COMMAND, { exact: true }))
      .toBeVisible();
  });

  it("shows the image only on a card that has one", async () => {
    await render(
      <OpenCodeCards
        cards={[
          openCodeCard(REVIEWER_PLUGIN, true),
          openCodeCard(CACHE_MANAGER_PLUGIN, false),
        ]}
      />,
    );

    const images = page.getByRole("img").elements();

    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute("alt")).toBe(REVIEWER_PLUGIN.page.image.alt);
  });

  it("copies a card's command", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    await render(
      <OpenCodeCards cards={[openCodeCard(REVIEWER_PLUGIN, false)]} />,
    );

    await page
      .getByRole("button", {
        name: "Copy the install command for opencode-permission-reviewer",
      })
      .click();

    expect(writeText).toHaveBeenCalledWith(REVIEWER_COMMAND);
  });

  it("links to the plugin's page, naming the plugin", async () => {
    await render(
      <OpenCodeCards cards={[openCodeCard(CACHE_MANAGER_PLUGIN, false)]} />,
    );

    const link = page.getByRole("link", {
      name: "About opencode-cache-manager",
    });

    await expect
      .element(link)
      .toHaveAttribute("href", "/opencode/opencode-cache-manager");
    await expect
      .element(link)
      .toHaveAttribute("aria-label", "About opencode-cache-manager");
  });
});
