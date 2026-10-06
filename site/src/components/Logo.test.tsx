import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { LOGO_FACE_SRC, LOGO_MARK_SRC } from "@/lib/assets";
import { Logo } from "./Logo.tsx";

describe("Logo", () => {
  it("shows the small mark, uncropped, under its label", async () => {
    render(<Logo label="AI Toolkit" />);

    const image = page.getByRole("img", { name: "AI Toolkit" });
    await expect.element(image).toHaveAttribute("src", LOGO_MARK_SRC);
    await expect.element(image).not.toHaveClass("scale-140");
  });

  it("shows the face on a black-bordered white tile, even inverse", async () => {
    const { container } = await render(
      <Logo inverse label="AI Toolkit" mark="face" />,
    );

    await expect
      .element(page.getByRole("img", { name: "AI Toolkit" }))
      .toHaveAttribute("src", LOGO_FACE_SRC);
    expect(container.firstElementChild).toHaveClass("bg-white", "border-black");
    expect(container.firstElementChild).not.toHaveClass("bg-main");
    expect(container.firstElementChild).not.toHaveClass("border-white");
  });

  it("is decorative without a label", async () => {
    const { container } = await render(<Logo />);

    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});
