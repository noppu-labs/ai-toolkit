import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

const EXECUTABLE_SUFFIXES =
  process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];

function isExecutableFile(candidate) {
  try {
    if (!statSync(candidate).isFile()) {
      return false;
    }

    accessSync(candidate, constants.X_OK);

    return true;
  } catch {
    return false;
  }
}

// Absolute PATH entries only, so a file in the working directory cannot stand
// in for the real tool.
export function findExecutable(name) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(dir)) {
      continue;
    }

    for (const suffix of EXECUTABLE_SUFFIXES) {
      const candidate = join(dir, `${name}${suffix}`);

      if (isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}
