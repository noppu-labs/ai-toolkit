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

// NO_TOOLS_PATH plus the fake language server under both real server names.
export function makeFakeLspPath(fakeServer: string): string {
  const bin = makeNoToolsPath();
  chmodSync(fakeServer, 0o755);
  for (const name of ["phpantom_lsp", "typescript-language-server"]) {
    symlinkSync(fakeServer, join(bin, name));
  }

  return bin;
}

// NO_TOOLS_PATH plus one fake binary under a real tool's name.
export function makeFakeToolPath(name: string, fake: string): string {
  const bin = makeNoToolsPath();
  chmodSync(fake, 0o755);
  symlinkSync(fake, join(bin, name));

  return bin;
}
