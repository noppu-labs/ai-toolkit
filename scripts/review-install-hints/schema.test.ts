import { describe, expect, it } from "vitest";
import {
  type Files,
  hints,
  lockfileCases,
  parseSchema,
  readSchema,
  registerSandbox,
  validate,
} from "./helpers.ts";

registerSandbox();

describe("install-hints.mjs", () => {
  it("matches the JSON Schema for any repo", () => {
    const schema = readSchema();
    const fixtures: Files[] = [
      {},
      { "composer.lock": "{}\n", "yarn.lock": "x\n", ".yarnrc.yml": "a: b\n" },
      {
        Makefile: "install:\n\t@true\n",
        "bin/setup": "#!/bin/sh\n",
        ".nvmrc": "22\n",
      },
      {
        "package.json": JSON.stringify({
          scripts: { setup: "x", postinstall: "y" },
        }),
        "README.md": "## Setup\n",
        ".env.example": "A=1\n",
      },
      { "package.json": "{", Makefile: "install:\n" },
      ...lockfileCases.map(([file, extra]) => ({ [file]: "x\n", ...extra })),
    ];

    for (const files of fixtures) {
      const output = hints(files);

      expect(validate(schema, output)).toEqual([]);
      expect(schema.required).toEqual(Object.keys(output));
    }

    expect(validate(schema, { headSha: "nope" })).not.toEqual([]);
  });

  it("rejects schema keywords the test validator does not model", () => {
    expect(() => parseSchema({ type: "object", oneOf: [] })).toThrow("oneOf");
  });
});
