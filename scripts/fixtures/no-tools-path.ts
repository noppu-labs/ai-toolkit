import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A PATH holding only node and git. Pointing PATH at node's own bin dir is not
// enough: under nvm, fnm, or volta that dir also holds globally installed
// gitnexus or typescript-language-server, which the tests assume are absent.
export function makeNoToolsPath(): string {
  const bin = mkdtempSync(join(tmpdir(), "investigate-bin-"));
  const git = spawnSync("which", ["git"], { encoding: "utf8" }).stdout.trim();
  symlinkSync(process.execPath, join(bin, "node"));
  symlinkSync(git, join(bin, "git"));

  return bin;
}

// NO_TOOLS_PATH plus fakes under real tool names, as { name: fakeScript }.
export function makeFakeToolsPath(fakes: Record<string, string>): string {
  const bin = makeNoToolsPath();
  for (const [name, fake] of Object.entries(fakes)) {
    chmodSync(fake, 0o755);
    symlinkSync(fake, join(bin, name));
  }

  return bin;
}

// NO_TOOLS_PATH plus the fake language server under both real server names.
export function makeFakeLspPath(fakeServer: string): string {
  return makeFakeToolsPath({
    phpantom_lsp: fakeServer,
    "typescript-language-server": fakeServer,
  });
}

// NO_TOOLS_PATH plus one fake binary under a real tool's name.
export function makeFakeToolPath(name: string, fake: string): string {
  return makeFakeToolsPath({ [name]: fake });
}
