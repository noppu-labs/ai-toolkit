import fc from "fast-check";
import { afterAll, describe, expect } from "vitest";
import { it } from "./fc-it.ts";

describe("it", () => {
  let exampleRuns = 0;
  let propertyRuns = 0;

  fc.configureGlobal({ numRuns: 5 });
  afterAll(() => fc.resetConfigureGlobal());

  it("runs an example body once whatever the global numRuns", () => {
    exampleRuns++;
  });

  it.prop([fc.nat()])("runs a property body numRuns times", () => {
    propertyRuns++;
  });

  it("counted one example run and five property runs", () => {
    expect(exampleRuns).toBe(1);
    expect(propertyRuns).toBe(5);
  });
});
