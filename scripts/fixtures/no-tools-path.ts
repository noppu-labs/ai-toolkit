import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
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
