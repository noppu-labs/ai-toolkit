import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

function isExecutableFile(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);

    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolves a tool name to the absolute path of its first match on PATH.
 * Empty and relative entries are skipped, so a tool in the working directory
 * cannot shadow the real one.
 */
export function resolveExecutable(
  name: string,
  pathValue: string | undefined = process.env.PATH,
): string {
  for (const dir of (pathValue ?? "").split(delimiter)) {
    if (!isAbsolute(dir)) {
      continue;
    }

    const candidate = join(dir, name);

    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }

  throw new Error(`\`${name}\` not found on PATH`);
}
