import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Button } from "./button.tsx";

const functionClassName = (): string => "y";

describe("Button", () => {
  it("appends a string className to the variant classes", async () => {
    render(<Button className="x">ok</Button>);

    await expect
      .element(page.getByRole("button", { name: "ok" }))
      .toHaveClass("x");
  });

  it("rejects a function className at compile time", () => {
    // Never called: the check is the type error. cn() would drop a function silently.
    const renderWithFunction = (): void => {
      // @ts-expect-error function className is not supported
      render(<Button className={functionClassName}>ok</Button>);
    };

    expect(renderWithFunction).toBeTypeOf("function");
  });
});
