import {
  existsSync,
  linkSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { LOCK_FILE } from "./constants.mjs";
import { refuse } from "./context.mjs";

function isAlive(pid) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function readLockPid(file) {
  try {
    const text = readFileSync(file, "utf8").trim();

    return /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
  } catch {
    return null;
  }
}

// Codes for a filesystem that cannot make hard links.
const NO_LINK_CODES = ["ENOTSUP", "EOPNOTSUPP", "EPERM", "ENOSYS"];

// The pid is written to a temporary file that is then linked into place, so
// the lock never exists without it and a reader cannot mistake a lock that is
// still being made for an unreadable one. A filesystem without hard links
// gets an exclusive create instead.
function createLock(file) {
  const temp = `${file}.${process.pid}.tmp`;

  try {
    writeFileSync(temp, String(process.pid), { flag: "wx" });
    linkSync(temp, file);

    return true;
  } catch (error) {
    if (error.code === "EEXIST") {
      return false;
    }

    if (NO_LINK_CODES.includes(error.code)) {
      return createLockWithoutLink(file);
    }

    throw error;
  } finally {
    rmSync(temp, { force: true });
  }
}

function createLockWithoutLink(file) {
  try {
    writeFileSync(file, String(process.pid), { flag: "wx" });

    return true;
  } catch (error) {
    if (error.code === "EEXIST") {
      return false;
    }

    throw error;
  }
}

function takeLock(ctx) {
  const file = join(ctx.gitDir, LOCK_FILE);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (createLock(file)) {
      return file;
    }

    // A lock its holder released since the failed create is not stale: take
    // it by creating it again, never by removing whatever is there now.
    if (!existsSync(file)) {
      continue;
    }

    const pid = readLockPid(file);

    if (pid !== null && isAlive(pid)) {
      refuse(
        "busy",
        `process ${pid} is running head-setup.mjs in this working tree; run one at a time. If none is running, delete ${file}`,
      );
    }

    rmSync(file, { force: true });
  }

  refuse("busy", `${file} could not be taken`);
}

function releaseLock(file) {
  try {
    rmSync(file, { force: true });
  } catch {
    // A stale lock is taken over by the next run; it must not hide the result.
  }
}

// enter, restore and forget read the record, change a tree and write the
// record again, so two at once would lose one of the entries.
export function locked(command) {
  return (ctx, args) => {
    const file = takeLock(ctx);

    try {
      return command(ctx, args);
    } finally {
      releaseLock(file);
    }
  };
}
