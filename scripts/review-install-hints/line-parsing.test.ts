import { describe, expect, it } from "vitest";
import { hints, registerSandbox } from "./helpers.ts";

const hugeLine = 160_000;

registerSandbox();

describe("install-hints.mjs", () => {
  describe("line parsing", () => {
    it("parses a 160 KB heading line in linear time", () => {
      const spaces = " ".repeat(hugeLine);
      const started = Date.now();
      const result = hints({
        "README.md": `# a${spaces}b\n## Setup${spaces}y #\n`,
      });

      expect(Date.now() - started).toBeLessThan(5000);
      expect(result.entryPoints).toEqual([
        {
          path: "README.md",
          kind: "docs-section",
          names: [`Setup${spaces}y`],
        },
      ]);
    }, 60_000);

    it("parses a 160 KB comment line in .tool-versions in linear time", () => {
      const started = Date.now();
      const result = hints({
        ".tool-versions": `${"#".repeat(hugeLine)}\r\nphp 8.4\r\n`,
      });

      expect(Date.now() - started).toBeLessThan(5000);
      expect(result.runtimes).toEqual([
        { path: ".tool-versions", tool: "php", version: "8.4" },
      ]);
    }, 60_000);

    it("gives no runtime for a CRLF .tool-versions comment", () => {
      const result = hints({
        ".tool-versions": "# tool versions\r\nphp 8.4\r\n",
      });

      expect(result.runtimes).toEqual([
        { path: ".tool-versions", tool: "php", version: "8.4" },
      ]);
    });

    it("splits CRLF docs, make, just and task files", () => {
      const result = hints({
        "README.md": "## Setup\r\n",
        Makefile: "install:\r\n",
        justfile: "setup:\r\n  echo\r\n",
        "Taskfile.yml": "tasks:\r\n  install:\r\n    cmds: []\r\n",
      });

      expect(result.entryPoints).toEqual([
        { path: "Makefile", kind: "make", names: ["install"] },
        { path: "README.md", kind: "docs-section", names: ["Setup"] },
        { path: "Taskfile.yml", kind: "task", names: ["install"] },
        { path: "justfile", kind: "just", names: ["setup"] },
      ]);
    });
  });
});
