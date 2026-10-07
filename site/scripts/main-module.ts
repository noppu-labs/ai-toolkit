import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Whether the module at `moduleUrl` is the script Node was started with. Compares real paths:
 * Node resolves symlinks in `import.meta.url` but not in `process.argv[1]`, so through a
 * symlinked checkout a plain URL comparison is false and the script silently does nothing.
 */
export function isMainModule(
  moduleUrl: string,
  entry: string | undefined = process.argv[1],
): boolean {
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
