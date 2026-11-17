import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { readSearchParam, writeSearchParams } from "@/lib/url-state";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import { resetPreferences } from "@/test/preferences";
import type { PluginEntry } from "../../catalog-types.ts";
import {
  FIXTURE_CATALOG,
  FIXTURE_REVIEW_PLUGIN,
} from "../../test/fixture-catalog.ts";
import { PluginCards } from "./PluginCards.tsx";

const PLUGINS: PluginEntry[] = [
  ...FIXTURE_CATALOG.plugins,
  FIXTURE_REVIEW_PLUGIN,
];

function card(name: string): ReturnType<typeof page.getByRole> {
  return page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

function chipsOf(name: string): string[] {
  return card(name)
    .getByRole("list", { name: "Contents" })
    .getByRole("listitem")
    .elements()
    .map((item) => item.textContent ?? "");
}

/** The commands a card shows, without the decorative step numbers and prompts. */
function shownCommands(name: string): string[] {
  return [...card(name).element().querySelectorAll("code")].map(
    (code) => code.textContent ?? "",
  );
}

const method = (name: string): ReturnType<typeof page.getByRole> =>
  page
    .getByRole("radiogroup", { name: "Install with" })
    .getByRole("radio", { name });

beforeEach(() => {
  resetPreferences();
});

afterEach(() => {
  resetPreferences();
  writeSearchParams({ q: null, plugin: null, skill: null }, { hash: "" });
  vi.restoreAllMocks();
});

describe("PluginCards", () => {
  it("is a section labelled by its heading", async () => {
    render(<PluginCards plugins={PLUGINS} />);

    await expect
      .element(
        page.getByRole("region", {
          name: "Review anywhere. Go deep on your stack.",
        }),
      )
      .toHaveAttribute("id", "plugins");
  });

  it("shows the plugins in the site order, not the input order", async () => {
    render(<PluginCards plugins={PLUGINS} />);

    await expect
      .element(page.getByRole("heading", { name: "review", exact: true }))
      .toBeVisible();
    const names = page
      .getByRole("heading", { level: 3 })
      .elements()
      .map((heading) => heading.textContent);
    expect(names).toEqual(["review", "laravel", "inertia-react"]);
  });

  it("renders the version and the non-zero counts as chips", async () => {
    render(<PluginCards plugins={PLUGINS} />);

    await expect.element(page.getByText("v0.1.3")).toBeVisible();
    await expect.element(page.getByText("v0.8.1")).toBeVisible();
    expect(chipsOf("laravel")).toEqual(["2 skills", "1 agent", "4 rules"]);
    expect(chipsOf("inertia-react")).toEqual(["1 skill", "1 agent", "2 rules"]);
    // No agents or rules: those chips are left out, and review works anywhere.
    expect(chipsOf("review")).toEqual(["1 skill", "any language"]);
  });

  it("shows the Claude Code commands, numbered, by default", async () => {
    render(<PluginCards plugins={PLUGINS} />);

    await expect
      .element(method("Claude Code"))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(method("skills CLI"))
      .toHaveAttribute("aria-checked", "false");
    expect(shownCommands("laravel")).toEqual([
      "/plugin marketplace add noppu-labs/ai-toolkit",
      "/plugin install laravel@ai-toolkit",
    ]);
  });

  it("copies exactly the commands it shows", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(<PluginCards plugins={PLUGINS} />);

    const laravel = card("laravel");
    await laravel
      .getByRole("button", {
        name: "Copy step 1 for laravel: add the marketplace",
      })
      .click();
    await laravel
      .getByRole("button", { name: "Copy step 2 for laravel: install it" })
      .click();
    await method("skills CLI").click();
    await laravel
      .getByRole("button", { name: "Copy the install command for laravel" })
      .click();

    expect(writeText.mock.calls).toEqual([
      ["/plugin marketplace add noppu-labs/ai-toolkit"],
      ["/plugin install laravel@ai-toolkit"],
      ["npx skills add noppu-labs/ai-toolkit/laravel"],
    ]);
  });

  it("does not carry a “Copied!” state over to the other method", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<PluginCards plugins={PLUGINS} />);

    const laravel = card("laravel");
    await laravel
      .getByRole("button", { name: "Copy step 2 for laravel: install it" })
      .click();
    await expect.element(laravel.getByText("Copied!")).toBeVisible();
    await method("skills CLI").click();

    await expect
      .element(
        laravel.getByRole("button", {
          name: "Copy the install command for laravel",
        }),
      )
      .toHaveTextContent("Copy");
    await expect.element(laravel.getByText("Copied!")).not.toBeInTheDocument();
  });

  it("switches every card to the skills CLI and stores the choice", async () => {
    render(<PluginCards plugins={PLUGINS} />);

    await method("skills CLI").click();

    await expect
      .element(method("skills CLI"))
      .toHaveAttribute("aria-checked", "true");
    expect(usePreferencesStore.getState().installMethod).toBe("skills-cli");
    expect(shownCommands("review")).toEqual([
      "npx skills add noppu-labs/ai-toolkit/review",
    ]);
    expect(shownCommands("inertia-react")).toEqual([
      "npx skills add noppu-labs/ai-toolkit/inertia-react",
    ]);
  });

  it("follows the install method chosen elsewhere on the page", async () => {
    render(<PluginCards plugins={PLUGINS} />);
    await expect
      .element(method("Claude Code"))
      .toHaveAttribute("aria-checked", "true");

    usePreferencesStore.getState().setInstallMethod("skills-cli");

    await expect
      .element(method("skills CLI"))
      .toHaveAttribute("aria-checked", "true");
    expect(shownCommands("laravel")).toEqual([
      "npx skills add noppu-labs/ai-toolkit/laravel",
    ]);
  });

  it("links each card to its plugin's page", async () => {
    render(<PluginCards plugins={PLUGINS} />);

    await expect
      .element(page.getByRole("link", { name: "See 2 laravel skills" }))
      .toHaveAttribute("href", "/plugins/laravel");
    await expect
      .element(page.getByRole("link", { name: "See 1 inertia-react skill" }))
      .toHaveAttribute("href", "/plugins/inertia-react");
  });

  it("leaves a click on the skills link to the browser", async () => {
    let prevented: boolean | undefined;
    const stop = (event: Event): void => {
      // React's handlers have run by the time the event reaches the document.
      prevented = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", stop);

    try {
      render(<PluginCards plugins={PLUGINS} />);
      await page.getByRole("link", { name: "See 2 laravel skills" }).click();
    } finally {
      document.removeEventListener("click", stop);
    }

    expect(prevented).toBe(false);
    // The test iframe carries its own query; the click must not add a filter.
    expect(readSearchParam("plugin")).toBeNull();
  });
});
