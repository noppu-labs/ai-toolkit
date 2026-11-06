import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type LockSources,
  lockEntrySchema,
} from "../../src/lib/opencode-lock.ts";
import { isMainModule } from "../main-module.ts";
import { checkContent, checkReleased, writePlugin } from "./content.ts";
import { type FetchedPlugin, fetchPlugin } from "./fetch-plugin.ts";
import { readLock, readLockSources, writeLock } from "./lockfile.ts";
import { defaultGit, type Fetcher, type GitRunner } from "./sources.ts";
import { entryLabel, syncSummary } from "./summary.ts";

export interface CliDeps {
  fetcher: Fetcher;
  git: GitRunner;
  siteDir: string;
  log: (line: string) => void;
}

type SourceEntry = LockSources["plugins"][string];

interface Options {
  check: boolean;
  refs: Map<string, string>;
  summary: string | undefined;
}

function defaults(): CliDeps {
  return {
    fetcher: fetch,
    git: defaultGit,
    siteDir: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."),
    log: console.log,
  };
}

function parseRef(value: string | undefined): [string, string] {
  const at = value?.indexOf("=") ?? -1;
  if (value === undefined || at < 1 || at === value.length - 1) {
    throw new Error("--ref takes <name>=<ref>");
  }
  return [value.slice(0, at), value.slice(at + 1)];
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    check: false,
    refs: new Map(),
    summary: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") {
      options.check = true;
    } else if (arg === "--ref") {
      i += 1;
      const [name, ref] = parseRef(argv[i]);
      options.refs.set(name, ref);
    } else if (arg === "--summary" && argv[i + 1] !== undefined) {
      i += 1;
      options.summary = argv[i];
    } else {
      throw new Error(`unknown argument ${arg}`);
    }
  }
  return options;
}

function runCheck(deps: CliDeps): number {
  const lock = readLock(deps.siteDir);
  const findings = [
    ...checkContent(deps.siteDir, lock),
    ...checkReleased(lock),
  ];
  for (const finding of findings) {
    deps.log(finding);
  }
  return findings.length === 0 ? 0 : 1;
}

function sameEntry(
  before: SourceEntry | undefined,
  next: FetchedPlugin["entry"],
): boolean {
  const parsed = lockEntrySchema.safeParse(before);
  return parsed.success && JSON.stringify(parsed.data) === JSON.stringify(next);
}

function reportFailure(deps: CliDeps, name: string, reason: unknown): void {
  const message = reason instanceof Error ? reason.message : String(reason);
  deps.log(`${name}: failed (${message})`);
}

async function runSync(options: Options, deps: CliDeps): Promise<number> {
  const before = readLockSources(deps.siteDir);
  const names = Object.keys(before.plugins);
  for (const name of options.refs.keys()) {
    if (!names.includes(name)) {
      throw new Error(`--ref names ${name}, which is not in the lock`);
    }
  }
  const results = await Promise.allSettled(
    names.map((name) =>
      fetchPlugin(
        name,
        before.plugins[name] as SourceEntry,
        deps,
        options.refs.get(name),
      ),
    ),
  );
  const plugins = { ...before.plugins };
  let failed = false;
  const writes: Promise<void>[] = [];
  results.forEach((result, index) => {
    const name = names[index] as string;
    if (result.status === "rejected") {
      failed = true;
      reportFailure(deps, name, result.reason);
    } else if (sameEntry(before.plugins[name], result.value.entry)) {
      deps.log(`${name}: up to date`);
    } else {
      deps.log(
        `${name}: ${entryLabel(before.plugins[name])} -> ${entryLabel(result.value.entry)}`,
      );
      writes.push(writePlugin(deps.siteDir, name, result.value.files));
      plugins[name] = result.value.entry;
    }
  });
  await Promise.all(writes);
  if (writes.length > 0) {
    const after = { ...before, plugins };
    writeLock(deps.siteDir, after);
    if (options.summary !== undefined) {
      writeFileSync(options.summary, syncSummary(before, after));
    }
  }
  return failed ? 1 : 0;
}

/** Runs the sync or `--check`; returns the exit code. */
export async function main(
  argv: readonly string[],
  deps: CliDeps = defaults(),
): Promise<number> {
  try {
    const options = parseArgs(argv);
    return options.check ? runCheck(deps) : await runSync(options, deps);
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
