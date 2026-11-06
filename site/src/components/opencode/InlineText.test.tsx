import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { InlineText } from "./InlineText.tsx";

describe("InlineText", () => {
  it("renders backtick pairs as code", async () => {
    const { container } = await render(
      <p>
        <InlineText text="use `opencode run` now" />
      </p>,
    );

    const codes = container.querySelectorAll("code");
    expect(codes).toHaveLength(1);
    expect(codes[0]?.textContent).toBe("opencode run");
  });

  it("shows HTML in the text literally", async () => {
    const { container } = await render(
      <p>
        <InlineText text="<b>x</b> & `y`" />
      </p>,
    );

    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("<b>x</b> & y");
  });
});
