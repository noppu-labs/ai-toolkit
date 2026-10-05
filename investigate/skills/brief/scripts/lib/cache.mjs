import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function defaultCacheDir(env = process.env) {
  return (
    env.INVESTIGATE_BRIEF_CACHE_DIR ||
    path.join(tmpdir(), "investigate-brief", "context7")
  );
}

export class TtlCache {
  #dir;
  #ttlMs;

  constructor(dir, ttlMs) {
    this.#dir = dir;
    this.#ttlMs = ttlMs;
  }

  #file(key) {
    return path.join(this.#dir, `${key.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
  }

  get(key) {
    try {
      const f = this.#file(key);
      if (Date.now() - statSync(f).mtimeMs > this.#ttlMs) return null;
      return JSON.parse(readFileSync(f, "utf8"));
    } catch {
      return null;
    }
  }

  put(key, data) {
    try {
      mkdirSync(this.#dir, { recursive: true });
      writeFileSync(this.#file(key), JSON.stringify(data));
    } catch {
      /* best-effort */
    }
  }
}
