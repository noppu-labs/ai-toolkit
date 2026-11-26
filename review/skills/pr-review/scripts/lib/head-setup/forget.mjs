import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { RECORD_FILE } from "./constants.mjs";
import { isLink } from "./record-store.mjs";

export function runForget(ctx) {
  const file = join(ctx.gitDir, RECORD_FILE);
  const existed = existsSync(file) || isLink(file);

  rmSync(file, { force: true });

  return { ok: true, forgotten: existed };
}
