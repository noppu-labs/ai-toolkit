import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pluginInstallHosts } from "./install-methods.ts";

describe("pluginInstallHosts", () => {
  it("gives Claude Code, the skills CLI and OpenCode for a plugin with a package", () => {
    expect(
      pluginInstallHosts({
        name: "review",
        opencodePackage: "@noppu-labs/opencode-review",
      }),
    ).toEqual([
      {
        label: "Claude Code",
        commands: [
          "/plugin marketplace add noppu-labs/ai-toolkit",
          "/plugin install review@ai-toolkit",
        ],
      },
      {
        label: "skills CLI",
        commands: ["npx skills add noppu-labs/ai-toolkit/review"],
      },
      {
        label: "OpenCode",
        commands: ["opencode plugin add @noppu-labs/opencode-review"],
      },
    ]);
  });

  it("leaves OpenCode out for a plugin without a package", () => {
    expect(
      pluginInstallHosts({ name: "laravel" }).map((host) => host.label),
    ).toEqual(["Claude Code", "skills CLI"]);
  });

  it("gives every host its own label, whatever the plugin", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        (name, pkg) => {
          const labels = pluginInstallHosts({
            name,
            ...(pkg === undefined ? {} : { opencodePackage: pkg }),
          }).map((host) => host.label);

          expect(new Set(labels).size).toBe(labels.length);
        },
      ),
    );
  });
});
