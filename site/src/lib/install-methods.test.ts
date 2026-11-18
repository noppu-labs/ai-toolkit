import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_ADD_COMMAND,
  pluginInstallHosts,
} from "./install-methods.ts";

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

  it("adds OpenCode only with a package, and names the plugin in every install command", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        (name, pkg) => {
          const hosts = pluginInstallHosts({
            name,
            ...(pkg === undefined ? {} : { opencodePackage: pkg }),
          });
          const opencode = hosts.filter((host) => host.label === "OpenCode");
          const opencodeCommands = opencode.flatMap((host) => host.commands);
          const installs = hosts
            .filter((host) => host.label !== "OpenCode")
            .flatMap((host) => host.commands)
            .filter((command) => command !== MARKETPLACE_ADD_COMMAND);

          expect(opencode).toHaveLength(pkg === undefined ? 0 : 1);
          expect(
            opencodeCommands.every(
              (command) => pkg !== undefined && command.endsWith(pkg),
            ),
          ).toBe(true);
          expect(installs).toHaveLength(2);
          expect(installs.filter((command) => !command.includes(name))).toEqual(
            [],
          );
        },
      ),
    );
  });
});
