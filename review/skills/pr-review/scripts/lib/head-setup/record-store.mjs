import {
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { RECORD_FILE } from "./constants.mjs";
import { refuse } from "./context.mjs";
import { parseRecord } from "./record.mjs";

// { entries } for a usable record, { entries: [] } for none, { problem }
// when it exists but cannot be trusted.
export function loadRecord(ctx) {
  const file = join(ctx.gitDir, RECORD_FILE);

  if (!existsSync(file) && !isLink(file)) {
    return { entries: [] };
  }

  if (isLink(file)) {
    return { problem: "the record is a symlink" };
  }

  try {
    return parseRecord(readFileSync(file, "utf8"));
  } catch (error) {
    return { problem: `the record cannot be read: ${error.message}` };
  }
}

export function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

export function requireRecord(ctx) {
  const loaded = loadRecord(ctx);

  if (loaded.problem !== undefined) {
    refuse(
      "record-unreadable",
      `${loaded.problem}; run \`head-setup.mjs forget\` to clear it`,
    );
  }

  return loaded.entries;
}

export function saveRecord(ctx, entries) {
  const file = join(ctx.gitDir, RECORD_FILE);

  if (entries.length === 0) {
    rmSync(file, { force: true });

    return;
  }

  const temp = `${file}.${process.pid}.tmp`;

  try {
    writeFileSync(
      temp,
      `${JSON.stringify({ version: 1, entries }, null, 2)}\n`,
      { mode: 0o600 },
    );
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    refuse(
      "record-write-failed",
      `the record cannot be written: ${error.message}`,
    );
  }
}

// A later restore reads the mark to print the discard command: the entry's
// changes came from the head, not from the person.
// Best effort: a failed write leaves the entry unmarked, and the refusal that
// follows must still carry the id, the paths and the command.
export function markIncomplete(ctx, id) {
  try {
    const loaded = loadRecord(ctx);

    if (loaded.problem === undefined) {
      saveRecord(
        ctx,
        loaded.entries.map((entry) =>
          entry.id === id ? { ...entry, incomplete: true } : entry,
        ),
      );
    }
  } catch {
    // The entry stays recorded without the mark.
  }
}

export function dropEntry(ctx, id) {
  const loaded = loadRecord(ctx);

  if (loaded.problem === undefined) {
    saveRecord(
      ctx,
      loaded.entries.filter((entry) => entry.id !== id),
    );
  }
}
