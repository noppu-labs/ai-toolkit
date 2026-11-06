import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { OpenCodePage } from "@/lib/load-opencode";
import { REVIEWER_PLUGIN } from "@/test/opencode-plugins";
import {
  Highlights,
  HowItWorks,
  Questions,
  Requirements,
} from "./PluginSections.tsx";

const { highlights, howItWorks, requirements, faq, links }: OpenCodePage =
  REVIEWER_PLUGIN.page;
const ACCENT = "bg-plugin-opencode-permission-reviewer";

/** Manifest text as it reads on the page, where backtick runs are code. */
function withoutBackticks(text: string): string {
  return text.replaceAll("`", "");
}

describe("Highlights", () => {
  it("is a section headed by the manifest's heading, with a card per item", async () => {
    await render(
      <Highlights
        accentClass={ACCENT}
        heading={highlights.heading}
        items={highlights.items}
      />,
    );

    await expect
      .element(page.getByRole("region", { name: highlights.heading }))
      .toBeVisible();
    await expect
      .element(page.getByRole("heading", { level: 2 }))
      .toHaveTextContent(highlights.heading);
    const titles = page
      .getByRole("heading", { level: 3 })
      .elements()
      .map((heading) => heading.textContent);
    expect(titles).toHaveLength(6);
    expect(titles).toEqual(highlights.items.map((item) => item.title));
  });

  it("renders backtick runs as code", async () => {
    const { container } = await render(
      <Highlights
        accentClass={ACCENT}
        heading={highlights.heading}
        items={highlights.items}
      />,
    );

    const codes = [...container.querySelectorAll("li p code")].map(
      (code) => code.textContent,
    );
    expect(codes.slice(0, 2)).toEqual(["allow", "deny"]);
  });
});

describe("HowItWorks", () => {
  it("lists the steps in order and shows the figure with its caption", async () => {
    const { container } = await render(
      <HowItWorks
        figure={howItWorks.figure}
        heading={howItWorks.heading}
        steps={howItWorks.steps}
      />,
    );

    const steps = [...container.querySelectorAll("ol > li")].map(
      (step) => step.lastElementChild?.textContent,
    );
    expect(steps).toEqual(howItWorks.steps.map(withoutBackticks));
    const image = page.getByRole("img", {
      name: howItWorks.figure?.alt ?? "",
    });
    await expect
      .element(image)
      .toHaveAttribute("src", "/_astro/result-attribution.svg");
    await expect.element(image).toHaveAttribute("width", "882");
    expect(container.querySelector("figure figcaption")?.textContent).toBe(
      howItWorks.figure?.caption,
    );
  });

  it("leaves the figure out when the manifest has none", async () => {
    const { container } = await render(
      <HowItWorks heading={howItWorks.heading} steps={howItWorks.steps} />,
    );

    expect(container.querySelector("figure")).toBeNull();
  });
});

describe("Requirements", () => {
  it("lists the requirements and shows the config under its path", async () => {
    const { container } = await render(
      <Requirements config={requirements.config} items={requirements.items} />,
    );

    const listed = page
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent);
    expect(listed).toEqual(requirements.items.map(withoutBackticks));
    expect(container.querySelector("pre > code")?.textContent).toBe(
      requirements.config?.code,
    );
    await expect
      .element(page.getByText(requirements.config?.path ?? "", { exact: true }))
      .toBeVisible();
  });

  it("opens each doc link in a new tab, with no referrer", async () => {
    await render(<Requirements items={requirements.items} links={links} />);

    const anchors = page.getByRole("link").elements();
    expect(anchors.map((anchor) => anchor.getAttribute("href"))).toEqual(
      links?.map((link) => link.href),
    );
    for (const anchor of anchors) {
      expect(anchor.getAttribute("target")).toBe("_blank");
      expect(anchor.getAttribute("rel")).toBe("noreferrer");
    }
  });
});

describe("Questions", () => {
  it("shows every question as a heading with its answer", async () => {
    await render(<Questions faq={faq} />);

    expect(
      page
        .getByRole("heading", { level: 3 })
        .elements()
        .map((heading) => heading.textContent),
    ).toEqual(faq?.map((item) => item.q));
    const answers = page
      .getByRole("heading", { level: 3 })
      .elements()
      .map((heading) => heading.nextElementSibling?.textContent);
    expect(answers).toEqual(faq?.map((item) => withoutBackticks(item.a)));
  });

  it.each([
    ["an empty FAQ", []],
    ["no FAQ", undefined],
  ])("renders nothing for %s", async (_, empty) => {
    const { container } = await render(<Questions faq={empty} />);

    expect(container.innerHTML).toBe("");
  });
});
