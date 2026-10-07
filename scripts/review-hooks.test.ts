import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";

type Decision = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "deny";
    permissionDecisionReason: string;
  };
};

type HookInput = {
  tool_name?: unknown;
  tool_input?: unknown;
  cwd?: unknown;
};

type GuardModule = {
  REASON: string;
  getCandidatePaths: (toolName: unknown, toolInput: unknown) => string[];
  getDecision: (input: HookInput) => Decision | null;
};

const hooksDir: string = join(import.meta.dirname, "..", "review", "hooks");
const scriptPath: string = join(hooksDir, "guard-task-output.mjs");

// The script is plain ESM outside tsconfig's `include`, so a static import
// would resolve to an untyped module. A computed specifier keeps the contract
// declared here and the runtime behaviour under test.
const mod: GuardModule = (await import(
  pathToFileURL(scriptPath).href
)) as GuardModule;

const getCandidatePaths: GuardModule["getCandidatePaths"] =
  mod.getCandidatePaths;
const getDecision: GuardModule["getDecision"] = mod.getDecision;

const root: string = mkdtempSync(join(tmpdir(), "guard-task-output-"));
const transcript: string = join(root, "agent.jsonl");
const agentOutput: string = join(root, "tasks", "agent.output");
const bashOutput: string = join(root, "tasks", "bash.output");

mkdirSync(join(root, "tasks"));
writeFileSync(transcript, "{}\n");
symlinkSync(transcript, agentOutput);
writeFileSync(bashOutput, "done\n");

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeBash(command: string, cwd: string = root): HookInput {
  return { tool_name: "Bash", tool_input: { command }, cwd };
}

describe("getCandidatePaths", () => {
  it("returns every .output token of a Bash command", () => {
    const command = `cp ${agentOutput} out.md 2>/dev/null; tail "${bashOutput}"`;

    expect(getCandidatePaths("Bash", { command })).toEqual([
      agentOutput,
      bashOutput,
    ]);
  });

  it("returns the Read file_path", () => {
    expect(getCandidatePaths("Read", { file_path: agentOutput })).toEqual([
      agentOutput,
    ]);
  });

  it("ignores other tools and malformed input", () => {
    expect(getCandidatePaths("Write", { file_path: agentOutput })).toEqual([]);
    expect(getCandidatePaths("Bash", { command: 42 })).toEqual([]);
    expect(getCandidatePaths("Read", null)).toEqual([]);
  });

  it("does not match a longer extension", () => {
    expect(
      getCandidatePaths("Bash", { command: "cat a.output.txt b.outputs" }),
    ).toEqual([]);
  });
});

describe("getDecision", () => {
  it("denies a Bash command that copies a symlinked .output file", () => {
    const decision = getDecision(
      makeBash(`cp ${agentOutput} scratch/code-review.out; echo ok`),
    );

    expect(decision?.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(decision?.hookSpecificOutput.permissionDecisionReason).toBe(
      mod.REASON,
    );
  });

  it("resolves a relative path against the hook's cwd", () => {
    expect(getDecision(makeBash("cat tasks/agent.output"))).not.toBeNull();
    expect(
      getDecision(makeBash("cat tasks/agent.output", tmpdir())),
    ).toBeNull();
  });

  it("denies a Read of a symlinked .output file", () => {
    expect(
      getDecision({
        tool_name: "Read",
        tool_input: { file_path: agentOutput },
      }),
    ).not.toBeNull();
  });

  it("allows a background Bash task's plain .output file", () => {
    expect(getDecision(makeBash(`tail -n 50 ${bashOutput}`))).toBeNull();
    expect(
      getDecision({ tool_name: "Read", tool_input: { file_path: bashOutput } }),
    ).toBeNull();
  });

  it("allows a symlink that does not end in .output", () => {
    expect(
      getDecision({ tool_name: "Read", tool_input: { file_path: transcript } }),
    ).toBeNull();
  });

  it("allows any command that names no .output file", () => {
    fc.assert(
      fc.property(
        fc.string().filter((command) => !command.includes(".output")),
        (command) => getDecision(makeBash(command)) === null,
      ),
    );
  });

  it("denies the symlink wherever it sits in a command", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom(" ", "; ", " && ", " | ", "\n"),
        (prefix, separator) =>
          getDecision(
            makeBash(`${prefix} cat ${agentOutput}${separator}echo ok`),
          ) !== null,
      ),
    );
  });
});

describe("guard-task-output.mjs", () => {
  function runHook(stdin: string): { status: number | null; stdout: string } {
    const result = spawnSync("node", [scriptPath], {
      input: stdin,
      encoding: "utf8",
    });

    return { status: result.status, stdout: result.stdout };
  }

  it("prints the deny decision and exits 0", () => {
    const result = runHook(
      JSON.stringify(makeBash(`cp ${agentOutput} out.md`)),
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      getDecision(makeBash(`cp ${agentOutput} out.md`)),
    );
  });

  it("prints nothing for an allowed call or unreadable input", () => {
    expect(runHook(JSON.stringify(makeBash("ls")))).toEqual({
      status: 0,
      stdout: "",
    });
    expect(runHook("not json")).toEqual({ status: 0, stdout: "" });
  });

  it("is registered as a PreToolUse hook on Bash and Read", () => {
    const config = JSON.parse(
      readFileSync(join(hooksDir, "hooks.json"), "utf8"),
    ) as {
      hooks: {
        PreToolUse: { matcher: string; hooks: { command: string }[] }[];
      };
    };
    const [entry] = config.hooks.PreToolUse;

    expect(entry?.matcher).toBe("Bash|Read");
    expect(entry?.hooks[0]?.command).toMatch(
      /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/guard-task-output\.mjs"$/,
    );
  });
});
