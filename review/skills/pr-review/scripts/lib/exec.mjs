import {
  accessSync,
  constants,
  existsSync,
  realpathSync,
  statSync,
} from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative } from "node:path";

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

// The nearest directory above the working directory that holds a `.git` file
// or directory. Found without running git, which is what is being looked up.
function findRepositoryRoot() {
  try {
    let dir = realpathSync(process.cwd());

    while (!existsSync(join(dir, ".git"))) {
      const parent = dirname(dir);

      if (parent === dir) {
        return null;
      }

      dir = parent;
    }

    return dir;
  } catch {
    return null;
  }
}

function isInside(root, path) {
  const offset = relative(root, path);

  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

function isInsideRepository(root, dir) {
  if (root === null) {
    return false;
  }

  try {
    return isInside(root, realpathSync(dir));
  } catch {
    return false;
  }
}

// Absolute PATH entries outside the repository only, so neither a file in the
// working directory nor a `bin` the checked-out head ships can stand in for
// the real tool.
export function findExecutable(name) {
  const root = findRepositoryRoot();

  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!isAbsolute(dir) || isInsideRepository(root, dir)) {
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
