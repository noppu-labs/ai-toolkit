import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import { resetPreferences } from "@/test/preferences";
import { InstallSection } from "./InstallSection.tsx";

const CLAUDE_CODE_COMMANDS = [
  "/plugin marketplace add noppu-labs/ai-toolkit",
  "/plugin install review@ai-toolkit",
  "/plugin install investigate@ai-toolkit",
  "/plugin install laravel@ai-toolkit",
  "/plugin install inertia-react@ai-toolkit",
  "/laravel:install-rules",
  "/inertia-react:install-rules",
];

const SKILLS_CLI_COMMANDS = [
  "npx skills add noppu-labs/ai-toolkit/review",
  "npx skills add noppu-labs/ai-toolkit/investigate",
  "npx skills add noppu-labs/ai-toolkit/laravel",
  "npx skills add noppu-labs/ai-toolkit/inertia-react",
];

const claudeCodeTab = page.getByRole("tab", { name: /Claude Code/ });
const skillsCliTab = page.getByRole("tab", { name: /skills CLI/ });

function stepTitles(): string[] {
  const steps = page
    .getByRole("tabpanel")
    .element()
    .querySelectorAll("ol > li");
  return [...steps].map((step) => step.firstElementChild?.textContent ?? "");
}

function mockClipboard(): ReturnType<typeof vi.fn> {
  return vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
}

beforeEach(() => {
  resetPreferences();
});

afterEach(() => {
  resetPreferences();
  vi.restoreAllMocks();
});

describe("InstallSection", () => {
  it("is the #install region, labelled by its heading", async () => {
    render(<InstallSection />);

    await expect
      .element(page.getByRole("region", { name: "Two ways in." }))
      .toHaveAttribute("id", "install");
  });

  it("shows the three Claude Code steps first", async () => {
    render(<InstallSection />);

    await expect
      .element(claudeCodeTab)
      .toHaveAttribute("aria-selected", "true");
    expect(stepTitles()).toEqual([
      "1Add the marketplace",
      "2Install what you need",
      "3Copy the stack rules (laravel, inertia-react)",
    ]);
    await expect
      .element(
        page.getByText("/plugin marketplace add noppu-labs/ai-toolkit", {
          exact: true,
        }),
      )
      .toBeVisible();
    await expect
      .element(page.getByText("install-rules commands", { exact: false }))
      .toBeVisible();
    await expect
      .element(page.getByText("npx skills add", { exact: false }))
      .not.toBeInTheDocument();
  });

  // One command per copy: a multi-line paste reaches Claude Code as one prompt.
  it.each(CLAUDE_CODE_COMMANDS)("copies “%s” on its own", async (command) => {
    const writeText = mockClipboard();
    render(<InstallSection />);

    await page
      .getByRole("button", { name: `Copy ${command}`, exact: true })
      .click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(command);
  });

  it("says how installed skills are named, next to the Claude Code steps", async () => {
    render(<InstallSection />);

    const hint = page
      .getByRole("tabpanel")
      .getByText("Skills are namespaced after install", { exact: false });
    await expect.element(hint).toBeVisible();
    expect(hint.element().textContent).toBe(
      "Skills are namespaced after install: run them as /<plugin>:<skill>, e.g. /review:comment-audit.",
    );
  });

  it("switches to the one skills CLI step and its note", async () => {
    render(<InstallSection />);

    await skillsCliTab.click();

    await expect.element(skillsCliTab).toHaveAttribute("aria-selected", "true");
    expect(stepTitles()).toEqual(["1Add plugins one by one"]);
    await expect
      .element(
        page.getByText("npx skills add noppu-labs/ai-toolkit/investigate", {
          exact: true,
        }),
      )
      .toBeVisible();
    await expect
      .element(page.getByText("is not set on this route", { exact: false }))
      .toBeVisible();
    await expect
      .element(page.getByText("/plugin marketplace add", { exact: false }))
      .not.toBeInTheDocument();
  });

  it.each(SKILLS_CLI_COMMANDS)("copies “%s” on its own", async (command) => {
    const writeText = mockClipboard();
    render(<InstallSection />);

    await skillsCliTab.click();
    await page
      .getByRole("button", { name: `Copy ${command}`, exact: true })
      .click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(command);
  });

  it("labels the tabs in full on wide screens", async () => {
    await page.viewport(1280, 800);
    render(<InstallSection />);

    await expect
      .element(page.getByRole("tab", { name: "Claude Code marketplace" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("tab", { name: "Vercel skills CLI" }))
      .toBeVisible();
    await page.viewport(414, 896);
  });

  it("wraps long commands on a phone instead of scrolling sideways", async () => {
    await page.viewport(360, 740);
    render(<InstallSection />);

    await skillsCliTab.click();
    const line = page.getByText(
      "npx skills add noppu-labs/ai-toolkit/inertia-react",
      { exact: true },
    );
    await expect.element(line).toBeVisible();

    const panel = page.getByRole("tabpanel").element();
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
    // It wrapped, and the repo slug stayed on one line.
    const slug = [...line.element().querySelectorAll("span")].find(
      (span) => span.textContent === "noppu-labs/ai-toolkit/",
    );
    expect(slug?.getClientRects()).toHaveLength(1);
    expect(line.element().getBoundingClientRect().height).toBeGreaterThan(
      Number.parseFloat(getComputedStyle(line.element()).lineHeight) * 1.5,
    );
    await page.viewport(414, 896);
  });

  it("remembers the chosen install method", async () => {
    render(<InstallSection />);

    await skillsCliTab.click();

    await expect
      .poll(() => usePreferencesStore.getState().installMethod)
      .toBe("skills-cli");
  });

  it("opens on the stored install method", async () => {
    usePreferencesStore.getState().setInstallMethod("skills-cli");
    render(<InstallSection />);

    await expect.element(skillsCliTab).toHaveAttribute("aria-selected", "true");
    await expect
      .element(
        page.getByRole("button", {
          name: "Copy npx skills add noppu-labs/ai-toolkit/review",
        }),
      )
      .toBeVisible();
  });
});
