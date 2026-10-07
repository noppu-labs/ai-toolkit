import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  PLUGIN_PARAM,
  QUERY_PARAM,
  readSearchParam,
  SKILL_PARAM,
  showPluginSkills,
  writeSearchParams,
} from "@/lib/url-state";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import { resetPreferences } from "@/test/preferences";
import type { PluginEntry, SkillEntry } from "../../catalog-types.ts";
import { SkillsCatalog } from "./SkillsCatalog.tsx";

function skill(plugin: string, name: string, description: string): SkillEntry {
  return {
    name,
    description,
    sourceUrl: `https://github.com/noppu-labs/ai-toolkit/blob/main/${plugin}/skills/${name}/SKILL.md`,
  };
}

function plugin(name: string, skills: SkillEntry[]): PluginEntry {
  return {
    name,
    description: `${name} plugin`,
    version: "1.0.0",
    agentCount: 0,
    ruleCount: 0,
    skills,
  };
}

const LONG_DESCRIPTION =
  "Orchestrate a three-stage review (correctness, type safety, comment audit) of one PR or a stack of PRs, delegating each stage to a subagent with a structural brief and consolidating one report. Use when asked for a comprehensive, full, or three-stage PR review, or to review a PR stack. It also explains every finding in plain words, links each to its line, grades it, and repeats the whole report in a single consolidated summary at the end.";

// Out of the site order on purpose, and with laravel long enough to collapse.
// Real skill names take their summary from locales/en/skills.json; the
// made-up `laravel-extra-*` ones fall back to their description's first sentence.
const PLUGINS: PluginEntry[] = [
  plugin("laravel", [
    skill(
      "laravel",
      "laravel-dtos",
      "Data Transfer Objects using Spatie Laravel Data.",
    ),
    skill(
      "laravel",
      "laravel-enums",
      "Backed enums with labels and business logic.",
    ),
    ...[1, 2, 3, 4, 5, 6].map((n) =>
      skill(
        "laravel",
        `laravel-extra-${n}`,
        `Extra skill number ${n}. Use when testing.`,
      ),
    ),
  ]),
  plugin("inertia-react", [
    skill("inertia-react", "shadcn", "Manages shadcn components and projects."),
  ]),
  plugin("investigate", [
    skill("investigate", "brief", "Generate a deterministic structural brief."),
    skill("investigate", "deep", "The full investigation of a service."),
    skill("investigate", "spec", "Claim-by-claim review of a spec."),
  ]),
  plugin("review", [
    skill("review", "comment-audit", "Audit every comment a branch adds."),
    skill("review", "pr-review", LONG_DESCRIPTION),
  ]),
];

const SITE_ORDER = [
  "pr-review",
  "comment-audit",
  "brief",
  "deep",
  "spec",
  "laravel-dtos",
  "laravel-enums",
  "laravel-extra-1",
  "laravel-extra-2",
  "laravel-extra-3",
  "laravel-extra-4",
  "laravel-extra-5",
  "laravel-extra-6",
  "shadcn",
];

const search = page.getByRole("searchbox", { name: "Filter skills" });
const chips = page.getByRole("group", { name: "Filter by plugin" });
const pane = page.getByRole("complementary", { name: "Skill details" });
const sheet = page.getByRole("dialog");

function chip(name: string): ReturnType<typeof page.getByRole> {
  return chips.getByRole("button", {
    name: new RegExp(`^${name} \\d+ skills?$`),
  });
}

function row(name: string): ReturnType<typeof page.getByRole> {
  return page.getByRole("button", { name: new RegExp(`^${name}\\b`) });
}

function rowNames(): string[] {
  return [...document.querySelectorAll("[data-skill-row]")].map(
    (element) => element.getAttribute("data-skill-row") ?? "",
  );
}

// Paints the colours bottom-up on a 1px canvas and reads back the composite sRGB.
function paint(...colors: string[]): number[] {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("No 2D canvas context");
  }
  for (const color of colors) {
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
  }

  return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}

function luminance(rgb: number[]): number {
  const [r = 0, g = 0, b = 0] = rgb.map((value) => {
    const channel = value / 255;

    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

// WCAG 1.4.11 asks 3:1 of a control's boundary against the section behind it.
function borderContrast(element: Element): number {
  const section = element.closest("section");
  if (section === null) {
    throw new Error("No enclosing section");
  }
  const outer = getComputedStyle(section).backgroundColor;
  const style = getComputedStyle(element);

  return contrast(
    paint(outer, style.backgroundColor, style.borderTopColor),
    paint(outer),
  );
}

async function onDesktop(): Promise<void> {
  await page.viewport(1280, 900);
}

async function onPhone(): Promise<void> {
  await page.viewport(390, 844);
}

beforeEach(() => {
  resetPreferences();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetPreferences();
  writeSearchParams(
    { q: null, plugin: null, skill: null },
    { hash: "", state: null },
  );
});

describe("SkillsCatalog filter bar", () => {
  it("keeps the search box and unpressed chip borders at 3:1 in dark mode", async () => {
    document.documentElement.classList.add("dark");
    render(<SkillsCatalog plugins={PLUGINS} />);
    await expect.element(search).toBeVisible();

    expect(borderContrast(search.element())).toBeGreaterThanOrEqual(3);
    expect(borderContrast(chip("laravel").element())).toBeGreaterThanOrEqual(3);
  });

  it("puts each chip's count in a badge read as a number of skills", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");
    const names = chips
      .getByRole("button")
      .elements()
      .map((button) => button.textContent);
    expect(names).toEqual([
      "all14 skills",
      "review2 skills",
      "investigate3 skills",
      "laravel8 skills",
      "inertia-react1 skill",
    ]);
    await expect
      .element(chips.getByRole("button", { name: "inertia-react 1 skill" }))
      .toBeVisible();
    const badge = chip("review").element().querySelector("span");
    expect(badge).toBeInstanceOf(Element);
    if (!(badge instanceof Element)) {
      return;
    }
    expect(badge.textContent).toBe("2 skills");
    expect(getComputedStyle(badge).fontVariantNumeric).toBe("tabular-nums");
  });

  it("swaps the badge colours on the pressed chip", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    await chip("review").click();

    const pressed = chip("review").element().querySelector("span");
    const unpressed = chip("laravel").element().querySelector("span");
    expect(pressed).toBeInstanceOf(Element);
    expect(unpressed).toBeInstanceOf(Element);
    if (!(pressed instanceof Element) || !(unpressed instanceof Element)) {
      return;
    }
    expect(getComputedStyle(pressed).backgroundColor).toBe("rgb(0, 0, 0)");
    expect(getComputedStyle(pressed).color).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(unpressed).backgroundColor).toBe(
      getComputedStyle(document.body).color,
    );
  });

  it("updates the counts as you type and dims, but keeps, empty chips", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await search.fill("laravel");

    await expect
      .element(chips.getByRole("button", { name: "all 8 skills" }))
      .toBeVisible();
    const review = chips.getByRole("button", { name: "review 0 skills" });
    await expect.element(review).toBeEnabled();
    await expect
      .poll(() => getComputedStyle(review.element()).opacity)
      .toBe("0.5");
    expect(getComputedStyle(chip("laravel").element()).opacity).toBe("1");

    await review.click();
    await expect.element(review).toHaveAttribute("aria-pressed", "true");
  });

  it("filters by name, summary and description, case-insensitively", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await search.fill("SPATIE");
    await expect.poll(rowNames).toEqual(["laravel-dtos"]);

    // From the pr-review summary in locales/en/skills.json.
    await search.fill("merges it all");
    await expect.poll(rowNames).toEqual(["pr-review"]);

    await search.fill("claim-by-claim");
    await expect.poll(rowNames).toEqual(["spec"]);
  });

  it("filters by plugin chip and keeps a chip pressed", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await chip("investigate").click();
    await expect
      .element(chip("investigate"))
      .toHaveAttribute("aria-pressed", "true");
    await expect.poll(rowNames).toEqual(["brief", "deep", "spec"]);

    await chip("investigate").click();
    await expect
      .element(chip("investigate"))
      .toHaveAttribute("aria-pressed", "true");

    await chip("all").click();
    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");
  });

  it("announces how many skills the filter shows", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    const status = page.getByRole("status");
    await expect.element(status).toHaveTextContent("14 skills shown");
    await chip("investigate").click();
    await expect.element(status).toHaveTextContent("3 skills shown");
    await search.fill("deep");
    await expect.element(status).toHaveTextContent("1 skill shown");
  });

  it("sticks below the header while the list scrolls", async () => {
    await onPhone();
    render(<SkillsCatalog plugins={PLUGINS} />);
    await expect.element(search).toBeVisible();

    const bar = search.element().closest(".sticky");
    expect(bar).not.toBeNull();
    expect(getComputedStyle(bar as Element).position).toBe("sticky");
    expect(getComputedStyle(bar as Element).top).toBe("64px");
  });
});

describe("SkillsCatalog list", () => {
  it("groups the skills by plugin in the site order, with counted headings", async () => {
    await onDesktop();
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect
      .element(page.getByRole("region", { name: "The whole catalog." }))
      .toHaveAttribute("id", "skills");
    const headings = page
      .getByRole("heading", { level: 3 })
      .elements()
      .map((heading) => heading.textContent);
    expect(headings.slice(0, 4)).toEqual([
      "review2 skills",
      "investigate3 skills",
      "laravel8 skills",
      "inertia-react1 skill",
    ]);
    await expect
      .element(page.getByRole("list", { name: "investigate 3 skills" }))
      .toBeVisible();
  });

  it("shows each skill's plain summary, falling back to the description's first sentence", async () => {
    await onDesktop();
    writeSearchParams({ [PLUGIN_PARAM]: "laravel" });
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect
      .element(row("laravel-dtos"))
      .toMatchTextContent("Data transfer objects with Spatie Laravel Data.");
    await expect
      .element(row("laravel-extra-1"))
      .toMatchTextContent(/^laravel-extra-1Extra skill number 1\.$/);
  });

  it("collapses long groups to six rows on desktop until “Show more”", async () => {
    await onDesktop();
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect
      .poll(rowNames)
      .toEqual(
        SITE_ORDER.filter(
          (name) => !["laravel-extra-5", "laravel-extra-6"].includes(name),
        ),
      );
    const more = page.getByRole("button", {
      name: "Show 2 more laravel skills",
    });
    await more.click();

    await expect.poll(rowNames).toEqual(SITE_ORDER);
    await expect.element(more).not.toBeInTheDocument();
    await expect.element(row("laravel-extra-5")).toHaveFocus();
  });

  it("collapses long groups to four rows on phones", async () => {
    await onPhone();
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect
      .element(page.getByRole("button", { name: "Show 4 more laravel skills" }))
      .toBeVisible();
    expect(rowNames()).not.toContain("laravel-extra-3");
  });

  it("shows every row while a query or a plugin narrows the list", async () => {
    await onDesktop();
    render(<SkillsCatalog plugins={PLUGINS} />);

    await chip("laravel").click();
    await expect.poll(() => rowNames().length).toBe(8);
    await expect
      .element(page.getByRole("button", { name: /^Show \d+ more/ }))
      .not.toBeInTheDocument();

    await chip("all").click();
    await search.fill("laravel");
    await expect.poll(() => rowNames().length).toBe(8);
  });

  it("shows an empty state and clears both the query and the chip", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await chip("review").click();
    await search.fill("spatie");
    await expect
      .element(page.getByText("No skills match your filter."))
      .toBeVisible();

    await page.getByRole("button", { name: "Clear filter" }).click();
    await expect.element(search).toHaveValue("");
    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");
    expect(readSearchParam(PLUGIN_PARAM)).toBeNull();
    expect(readSearchParam(QUERY_PARAM)).toBeNull();
    await expect.poll(() => rowNames().length).toBeGreaterThan(0);
  });
});

describe("SkillsCatalog detail pane (desktop)", () => {
  beforeEach(onDesktop);

  it("selects the first skill in the site order by default", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect
      .element(row("pr-review"))
      .toHaveAttribute("aria-current", "true");
    await expect
      .element(row("pr-review"))
      .toHaveAttribute("aria-controls", pane.element().id);
    await expect
      .element(pane.getByRole("heading", { level: 3 }))
      .toHaveTextContent("pr-review");
    await expect.element(pane).toMatchTextContent("review1 of 14");
    await expect
      .element(pane)
      .toMatchTextContent(
        "Reviews a PR, or a stack of PRs, three ways (correctness, type safety, comments) and merges it all into one report.",
      );
    await expect
      .element(pane)
      .toMatchTextContent("Invoked as review:pr-review");
    await expect
      .element(pane.getByRole("link", { name: "SKILL.md of pr-review" }))
      .toHaveAttribute(
        "href",
        "https://github.com/noppu-labs/ai-toolkit/blob/main/review/skills/pr-review/SKILL.md",
      );
  });

  it("shows a selected row in the pane and the URL", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await row("deep").click();

    await expect.element(row("deep")).toHaveAttribute("aria-current", "true");
    await expect.element(row("pr-review")).not.toHaveAttribute("aria-current");
    await expect
      .element(pane.getByRole("heading", { level: 3 }))
      .toHaveTextContent("deep");
    await expect.element(pane).toMatchTextContent("investigate4 of 14");
    expect(readSearchParam(SKILL_PARAM)).toBe("deep");
    expect(getComputedStyle(row("deep").element()).backgroundColor).not.toBe(
      getComputedStyle(row("brief").element()).backgroundColor,
    );
  });

  it("steps through the filtered list with Previous and Next, wrapping round", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    const heading = pane.getByRole("heading", { level: 3 });
    const next = pane.getByRole("button", { name: "Next skill" });
    const previous = pane.getByRole("button", { name: "Previous skill" });

    await next.click();
    await expect.element(heading).toHaveTextContent("comment-audit");
    await previous.click();
    await previous.click();
    await expect.element(heading).toHaveTextContent("shadcn");
    await expect.element(pane).toMatchTextContent("14 of 14");

    await chip("investigate").click();
    await expect.element(heading).toHaveTextContent("brief");
    await next.click();
    await expect.element(heading).toHaveTextContent("deep");
    await next.click();
    await next.click();
    await expect.element(heading).toHaveTextContent("brief");
  });

  it("opens a collapsed group when Next reaches a hidden row", async () => {
    writeSearchParams({ [SKILL_PARAM]: "laravel-extra-4" });
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect.poll(rowNames).not.toContain("laravel-extra-5");
    await pane.getByRole("button", { name: "Next skill" }).click();

    await expect
      .element(row("laravel-extra-5"))
      .toHaveAttribute("aria-current", "true");
    await pane.getByRole("button", { name: "Next skill" }).click();
    await pane.getByRole("button", { name: "Next skill" }).click();
    // The group stays open after the selection leaves it.
    await expect.poll(rowNames).toEqual(SITE_ORDER);
  });

  it("clamps what the agent reads to four lines, with a toggle only when longer", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    const toggle = pane.getByRole("button", { name: "Show all" });
    await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
    const text = document.getElementById(
      toggle.element().getAttribute("aria-controls") ?? "",
    );
    expect(text?.textContent).toBe(LONG_DESCRIPTION);
    expect(getComputedStyle(text as Element).webkitLineClamp).toBe("4");

    await toggle.click();
    const less = pane.getByRole("button", { name: "Show less" });
    await expect.element(less).toHaveAttribute("aria-expanded", "true");
    expect(getComputedStyle(text as Element).webkitLineClamp).toBe("none");

    await row("deep").click();
    await expect
      .element(pane)
      .toMatchTextContent("The full investigation of a service.");
    await expect
      .element(pane.getByRole("button", { name: /^Show (all|less)$/ }))
      .not.toBeInTheDocument();
  });

  it("installs with the visitor's install method and switches it", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect
      .element(pane)
      .toMatchTextContent("Install review · Claude Code");
    await expect
      .element(pane)
      .toMatchTextContent("/plugin marketplace add noppu-labs/ai-toolkit");
    await expect
      .element(pane)
      .toMatchTextContent("/plugin install review@ai-toolkit");

    await pane
      .getByRole("button", { name: "Use the skills CLI instead" })
      .click();

    expect(usePreferencesStore.getState().installMethod).toBe("skills-cli");
    await expect
      .element(pane)
      .toMatchTextContent("Install review · skills CLI");
    await expect
      .element(pane)
      .toMatchTextContent("npx skills add noppu-labs/ai-toolkit/review");
    await expect
      .element(pane.getByRole("button", { name: "Use Claude Code instead" }))
      .toBeVisible();
  });

  it("copies the install commands and a link to the skill", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    usePreferencesStore.getState().setInstallMethod("skills-cli");
    render(<SkillsCatalog plugins={PLUGINS} />);
    await row("deep").click();

    await pane
      .getByRole("button", { name: "Copy the install command for investigate" })
      .click();
    expect(writeText).toHaveBeenLastCalledWith(
      "npx skills add noppu-labs/ai-toolkit/investigate",
    );

    const copyLink = pane.getByRole("button", { name: "Copy link to deep" });
    await copyLink.click();
    expect(writeText).toHaveBeenLastCalledWith(
      `${window.location.origin}/?skill=deep#skills`,
    );
    await expect.element(copyLink).toMatchTextContent("Link copied!");
  });

  it("keeps a selection the query filters out in the pane, unnumbered", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    await row("deep").click();

    await search.fill("laravel");

    await expect
      .element(pane.getByRole("heading", { level: 3 }))
      .toHaveTextContent("deep");
    await expect.element(pane).toMatchTextContent("investigate– of 8");
  });

  it("starts a plugin chip from the plugin's first skill", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    await row("deep").click();

    await chip("laravel").click();

    expect(readSearchParam(SKILL_PARAM)).toBeNull();
    await expect
      .element(pane.getByRole("heading", { level: 3 }))
      .toHaveTextContent("laravel-dtos");
    await expect.element(pane).toMatchTextContent("laravel1 of 8");
  });

  it("shows no skill, and disables Previous and Next, when the filter matches nothing", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    await row("deep").click();

    await search.fill("zzz-no-such-skill");

    await expect.element(pane).toMatchTextContent("No skill to show.");
    await expect
      .element(pane.getByRole("heading", { level: 3 }))
      .not.toBeInTheDocument();
    await expect
      .element(pane.getByRole("button", { name: "Previous skill" }))
      .toBeDisabled();
    await expect
      .element(pane.getByRole("button", { name: "Next skill" }))
      .toBeDisabled();
  });

  it("does not open a sheet when the window narrows to a phone", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    await row("deep").click();
    expect(readSearchParam(SKILL_PARAM)).toBe("deep");

    await onPhone();

    await expect.element(pane).not.toBeInTheDocument();
    await expect.poll(() => readSearchParam(SKILL_PARAM)).toBeNull();
    await expect.element(sheet).not.toBeInTheDocument();
  });
});

describe("SkillsCatalog detail sheet (phones)", () => {
  beforeEach(onPhone);

  it("opens a row in a modal sheet and returns focus to it on Escape", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    await expect.element(pane).not.toBeInTheDocument();
    await expect
      .element(row("deep"))
      .toHaveAttribute("aria-haspopup", "dialog");

    await row("deep").click();

    await expect.element(sheet).toBeVisible();
    await expect.element(sheet).toHaveAccessibleName("deep");
    await expect.element(sheet).toMatchTextContent("investigate4 of 14");
    await expect
      .element(sheet)
      .toMatchTextContent("Invoked as investigate:deep");
    expect(readSearchParam(SKILL_PARAM)).toBe("deep");
    await expect
      .element(sheet.getByRole("button", { name: "Copy link to deep" }))
      .toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(sheet).not.toBeInTheDocument();
    await expect.element(row("deep")).toHaveFocus();
    expect(readSearchParam(SKILL_PARAM)).toBeNull();
  });

  it("closes from the close button and keeps focus inside while open", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    await row("brief").click();
    await expect.element(sheet).toBeVisible();

    for (let index = 0; index < 12; index++) {
      // biome-ignore lint/performance/noAwaitInLoops: each Tab depends on the last.
      await userEvent.tab();
      expect(sheet.element().contains(document.activeElement)).toBe(true);
    }

    await sheet.getByRole("button", { name: "Close" }).click();
    await expect.element(sheet).not.toBeInTheDocument();
    await expect.element(row("brief")).toHaveFocus();
  });

  it("closes when the scrim is tapped", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    await row("spec").click();
    await expect.element(sheet).toBeVisible();

    await userEvent.click(document.body, { position: { x: 195, y: 20 } });

    await expect.element(sheet).not.toBeInTheDocument();
  });

  it("opens in a new history entry, so Back closes it", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await row("deep").click();
    await expect.element(sheet).toBeVisible();

    window.history.back();

    await expect.element(sheet).not.toBeInTheDocument();
    expect(readSearchParam(SKILL_PARAM)).toBeNull();
  });

  it("goes back from the entry it opened when its close button closes it", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    const before = window.history.state;

    await row("deep").click();
    await expect.element(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();

    await expect.element(sheet).not.toBeInTheDocument();
    expect(readSearchParam(SKILL_PARAM)).toBeNull();
    expect(window.history.state).toBe(before);
  });

  it("closes a shared link's sheet in place", async () => {
    writeSearchParams({ [SKILL_PARAM]: "deep" });
    const length = window.history.length;
    render(<SkillsCatalog plugins={PLUGINS} />);
    await expect.element(sheet).toBeVisible();

    await sheet.getByRole("button", { name: "Close" }).click();

    await expect.element(sheet).not.toBeInTheDocument();
    expect(readSearchParam(SKILL_PARAM)).toBeNull();
    expect(window.history.length).toBe(length);
  });

  it("returns focus to a deep-linked row past the fold of its group", async () => {
    writeSearchParams({ [SKILL_PARAM]: "laravel-extra-5" });
    render(<SkillsCatalog plugins={PLUGINS} />);
    await expect.element(sheet).toHaveAccessibleName("laravel-extra-5");

    await userEvent.keyboard("{Escape}");

    await expect.element(sheet).not.toBeInTheDocument();
    await expect.element(row("laravel-extra-5")).toHaveFocus();
  });

  it("does not highlight a selection in the list", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect.element(row("pr-review")).not.toHaveAttribute("aria-current");
  });
});

describe("SkillsCatalog URL state", () => {
  it("opens a deep link's skill and plugin on desktop", async () => {
    await onDesktop();
    writeSearchParams({ skill: "deep", plugin: "investigate" });
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect
      .element(chip("investigate"))
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(row("deep")).toHaveAttribute("aria-current", "true");
    await expect.element(pane).toMatchTextContent("investigate2 of 3");
  });

  it("opens a deep link's skill in the sheet on phones", async () => {
    await onPhone();
    writeSearchParams({ skill: "deep", plugin: "investigate" });
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect.element(sheet).toHaveAccessibleName("deep");
  });

  it("reads and writes the query", async () => {
    writeSearchParams({ q: "spatie" });
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect.element(search).toHaveValue("spatie");
    await expect.poll(rowNames).toEqual(["laravel-dtos"]);

    await search.fill("brief");
    expect(readSearchParam(QUERY_PARAM)).toBe("brief");
    await search.fill("");
    expect(readSearchParam(QUERY_PARAM)).toBeNull();
  });

  it("replaces the history entry rather than adding one", async () => {
    await onDesktop();
    const length = window.history.length;
    render(<SkillsCatalog plugins={PLUGINS} />);

    await search.fill("comment");
    await chip("review").click();
    await row("comment-audit").click();

    expect(window.location.search).toContain("q=comment");
    expect(window.location.search).toContain("plugin=review");
    expect(window.location.search).toContain("skill=comment-audit");
    expect(window.history.length).toBe(length);
  });

  it("keeps the hash while it writes the query", async () => {
    writeSearchParams({}, { hash: "skills" });
    render(<SkillsCatalog plugins={PLUGINS} />);

    await search.fill("deep");

    expect(window.location.hash).toBe("#skills");
  });

  it("ignores an unknown plugin or skill in the URL", async () => {
    await onDesktop();
    writeSearchParams({ plugin: "no-such-plugin", skill: "no-such-skill" });
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");
    await expect
      .element(row("pr-review"))
      .toHaveAttribute("aria-current", "true");
  });

  it("ignores an unknown skill on phones too", async () => {
    await onPhone();
    writeSearchParams({ skill: "no-such-skill" });
    render(<SkillsCatalog plugins={PLUGINS} />);

    await expect.element(search).toBeVisible();
    await expect.element(sheet).not.toBeInTheDocument();
  });

  it("follows the URL when a link elsewhere sets the plugin", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");

    writeSearchParams({ [PLUGIN_PARAM]: "inertia-react" });

    await expect
      .element(chip("inertia-react"))
      .toHaveAttribute("aria-pressed", "true");
    await expect.poll(rowNames).toEqual(["shadcn"]);
  });

  it("keeps the URL in step with the chips", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);

    await chip("review").click();
    expect(readSearchParam(PLUGIN_PARAM)).toBe("review");

    await chip("all").click();
    expect(readSearchParam(PLUGIN_PARAM)).toBeNull();
  });

  it("still follows a chip when the browser refuses to rewrite the URL", async () => {
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new DOMException("Too many calls", "SecurityError");
    });
    render(<SkillsCatalog plugins={PLUGINS} />);

    await chip("review").click();

    await expect
      .element(chip("review"))
      .toHaveAttribute("aria-pressed", "true");
    await expect.poll(rowNames).toEqual(["pr-review", "comment-audit"]);
  });

  it("follows Back to the query a plugin card's link cleared", async () => {
    render(<SkillsCatalog plugins={PLUGINS} />);
    await search.fill("spatie");

    showPluginSkills("laravel");
    await expect.element(search).toHaveValue("");
    await expect
      .element(chip("laravel"))
      .toHaveAttribute("aria-pressed", "true");

    window.history.back();

    await expect.element(search).toHaveValue("spatie");
    await expect.element(chip("all")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(rowNames).toEqual(["laravel-dtos"]);
  });
});
