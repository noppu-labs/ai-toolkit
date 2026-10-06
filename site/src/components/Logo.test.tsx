import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { LOGO_MARK_SRC } from "@/lib/assets";
import { Logo } from "./Logo.tsx";

describe("Logo", () => {
  it("shows the small mark, uncropped, under its label", async () => {
    render(<Logo label="AI Toolkit" />);

    const image = page.getByRole("img", { name: "AI Toolkit" });
    await expect.element(image).toHaveAttribute("src", LOGO_MARK_SRC);
    await expect.element(image).not.toHaveClass("scale-140");
  });

  it("is decorative without a label", async () => {
    const { container } = await render(<Logo />);

    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});
