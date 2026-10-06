import { describe, expect, it } from "vitest";
import { cn } from "./utils.ts";

describe("cn", () => {
  it("lets an arbitrary shadow replace shadow-shadow", () => {
    expect(cn("shadow-shadow", "shadow-[3px_3px_0_0_var(--color-main)]")).toBe(
      "shadow-[3px_3px_0_0_var(--color-main)]",
    );
  });

  it("lets shadow-shadow-md replace shadow-shadow", () => {
    expect(cn("shadow-shadow", "shadow-shadow-md")).toBe("shadow-shadow-md");
  });

  it("lets shadow-none replace shadow-shadow", () => {
    expect(cn("shadow-shadow", "shadow-none")).toBe("shadow-none");
  });

  it("keeps font-heading beside a font family", () => {
    expect(cn("font-heading", "font-mono")).toBe("font-heading font-mono");
  });

  it("lets font-bold replace font-heading", () => {
    expect(cn("font-heading", "font-bold")).toBe("font-bold");
  });

  it("lets an arbitrary radius replace rounded-base", () => {
    expect(cn("rounded-base", "rounded-[8px]")).toBe("rounded-[8px]");
  });
});
