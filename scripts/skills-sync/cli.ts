// CLI dispatch. The entrypoint (scripts/sync.ts) resolves `root` from its own
// location and passes argv, so nothing in skills-sync/ reads process state on
// import: every command takes `root` as a parameter and stays testable
// against a temp-dir root.
import {
  acceptSkill,
  diffSkill,
  getStatusRows,
  parseSkillArg,
  pullSkill,
  seedSkill,
} from "./commands.ts";
import { getErrorMessage } from "./errors.ts";
import { readLock } from "./lockfile.ts";
import { PLUGINS } from "./types.ts";
import { verifyAll } from "./verify.ts";

function runStatus(root: string): void {
  for (const row of getStatusRows(root)) {
    console.log(`${row.state.padEnd(20)} ${row.id}`);
  }
}

function runVerify(root: string): void {
  const problems = verifyAll(root);

  for (const problem of problems) {
    console.error(problem);
  }

  if (problems.length > 0) {
    process.exit(1);
  }

  console.log("skills-lock.json and skills/ are consistent");
}

function runDiff(root: string, target?: string): void {
  const { plugin, name } = parseSkillArg(target);

  process.exit(diffSkill(root, plugin, name));
}

function runPull(root: string, target?: string, flag?: string): void {
  const { plugin, name } = parseSkillArg(target);
  const state = pullSkill(root, plugin, name, { force: flag === "--force" });

  console.log(`pulled ${target} (was ${state})`);
}

function runAccept(root: string, target?: string): void {
  const { plugin, name } = parseSkillArg(target);

  acceptSkill(root, plugin, name);
  console.log(`re-baselined vendoredHash for ${target}`);
}

function reportSeed(
  target: string,
  { customized }: { customized: boolean },
): void {
  console.log(`seeded ${target}`);

  if (customized) {
    console.warn(
      `  warning: ${target} vendored content differs from upstream at this baseline.\n` +
        `  If that is not a deliberate customization, run: pull ${target}`,
    );
  }
}

function runSeed(root: string, target?: string): void {
  if (!target) {
    for (const plugin of PLUGINS) {
      for (const name of Object.keys(readLock(root, plugin).skills)) {
        reportSeed(`${plugin}/${name}`, seedSkill(root, plugin, name));
      }
    }

    return;
  }

  const { plugin, name } = parseSkillArg(target);

  reportSeed(target, seedSkill(root, plugin, name));
}

type Command = (root: string, target?: string, flag?: string) => void;

const COMMANDS = new Map<string, Command>([
  ["status", runStatus],
  ["verify", runVerify],
  ["diff", runDiff],
  ["pull", runPull],
  ["accept", runAccept],
  ["seed", runSeed],
]);

export function runMain(root: string, argv: string[]): void {
  const [command = "", target, flag] = argv;
  const handler = COMMANDS.get(command);

  if (!handler) {
    console.error(
      "usage: skills-sync <status|verify|diff|pull|accept|seed> [<plugin>/<skill>] [--force]",
    );
    process.exit(2);
  }

  try {
    handler(root, target, flag);
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exit(1);
  }
}
