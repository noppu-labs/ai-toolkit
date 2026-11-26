import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  branchOf,
  commit,
  enter,
  git,
  headOf,
  listAt,
  makeBin,
  makeFixture,
  makeRepo,
  nextPath,
  readRecord,
  registerSandbox,
  run,
  runPrinted,
  sandbox,
  switchCommand,
  write,
} from "./helpers.ts";

registerSandbox();

describe("head-setup.mjs", () => {
  describe("printed commands", () => {
    it("carries --no-guess and --no-overwrite-ignore in the script's own switch back", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const log = nextPath("git-log");
      const spy = `#!/bin/sh\necho "$*" >> "${log}"\nexec REAL_GIT "$@"\n`;

      run(dir, ["enter", "checkout", head], makeBin(spy));
      run(dir, ["restore"], makeBin(spy));

      const lines = readFileSync(log, "utf8")
        .split("\n")
        .filter((line) => / switch /.test(line));

      expect(
        lines.some((line) =>
          line.endsWith("switch --no-guess --no-overwrite-ignore main"),
        ),
      ).toBe(true);
    });

    it("declines branch-gone with a command that recreates the branch at the recorded commit", () => {
      const { dir, head, base } = makeFixture({}, { "b.txt": "b\n" });

      git(dir, "switch", "-q", "-c", "feature");

      const from = commit(dir, { "f.txt": "f\n" });

      git(dir, "remote", "add", "origin", join(sandbox, "nowhere"));
      git(dir, "update-ref", "refs/remotes/origin/feature", base);
      enter(dir, "checkout", head);
      git(dir, "branch", "-q", "-D", "feature");

      const outcome = run(dir, ["restore"]);
      const declined = listAt(outcome.json, "declined");

      expect(outcome.status).toBe(1);
      expect(declined).toMatchObject([
        {
          reason: "branch-gone",
          command: `git -c core.hooksPath=/dev/null -c submodule.recurse=false -C ${dir} switch --no-overwrite-ignore -c feature ${from}`,
        },
      ]);
      expect(headOf(dir)).toBe(head);
      expect(readRecord(dir).entries).toHaveLength(1);

      runPrinted(String(declined[0]?.command), dir);

      expect(branchOf(dir)).toBe("feature");
      expect(headOf(dir)).toBe(from);
    });

    it("prints the recreate command when a commit on the head also needs keeping", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      git(dir, "switch", "-q", "-c", "feature");

      const from = headOf(dir);

      enter(dir, "checkout", head);
      commit(dir, { "mine.txt": "m\n" });
      git(dir, "branch", "-q", "-D", "feature");

      const declined = listAt(run(dir, ["restore"]).json, "declined");

      runPrinted(String(declined[0]?.command), dir);

      expect(branchOf(dir)).toBe("feature");
      expect(headOf(dir)).toBe(from);
    });

    it("keeps an ignored file on the switch back to a detached start", () => {
      const dir = makeRepo({ "keep.env": "tracked\n" });

      git(dir, "switch", "-q", "-c", "drop");
      git(dir, "rm", "-q", "keep.env");
      commit(dir, { ".gitignore": "keep.env\n" });

      const head = headOf(dir);

      git(dir, "switch", "-q", "main");
      git(dir, "switch", "-q", "--detach", "main");
      enter(dir, "checkout", head);
      write(dir, "keep.env", "mine\n");

      const outcome = run(dir, ["restore"]);

      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "switch-failed" },
      ]);
      expect(readFileSync(join(dir, "keep.env"), "utf8")).toBe("mine\n");
    });

    it("prints a switch command that cannot overwrite an ignored file", () => {
      const dir = makeRepo({ "keep.env": "tracked\n" });

      git(dir, "switch", "-q", "-c", "drop");
      git(dir, "rm", "-q", "keep.env");
      commit(dir, { ".gitignore": "keep.env\n" });

      const head = headOf(dir);

      git(dir, "switch", "-q", "main");
      enter(dir, "checkout", head);
      write(dir, "keep.env", "mine\n");

      const outcome = run(dir, ["restore"]);
      const declined = listAt(outcome.json, "declined");

      expect(declined).toMatchObject([{ reason: "switch-failed" }]);

      runPrinted(String(declined[0]?.command), dir);

      expect(readFileSync(join(dir, "keep.env"), "utf8")).toBe("mine\n");
      expect(headOf(dir)).toBe(head);
    });

    it("prints a head-moved command that keeps the commits first", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);

      const mine = commit(dir, { "mine.txt": "m\n" });
      const declined = listAt(run(dir, ["restore"]).json, "declined");

      runPrinted(String(declined[0]?.command), dir);

      const kept = `pr-review-kept-${mine.slice(0, 12)}`;

      expect(git(dir, "rev-parse", kept)).toBe(mine);
      expect(branchOf(dir)).toBe("main");
    });

    it("quotes branch names with shell characters in the printed command", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const name = "feat/x;touch$IFS'y'";

      git(dir, "switch", "-q", "-c", name);
      enter(dir, "checkout", head);
      git(dir, "commit", "-q", "--allow-empty", "-m", "mine");

      const declined = listAt(run(dir, ["restore"]).json, "declined");

      const command = String(declined[0]?.command);
      const quoted = String.raw`'feat/x;touch$IFS'\''y'\'''`;

      expect(command).toContain(" && git ");
      expect(command.endsWith(switchCommand(dir, quoted))).toBe(true);
    });

    it("names the discard command in a dirty decline, with the branch gone too", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      git(dir, "switch", "-q", "-c", "feature");

      const from = headOf(dir);

      enter(dir, "checkout", head);
      git(dir, "branch", "-q", "-D", "feature");
      write(dir, "b.txt", "edited\n");

      const declined = listAt(run(dir, ["restore"]).json, "declined");
      const detail = String(declined[0]?.detail);

      expect(declined).toMatchObject([{ reason: "dirty" }]);
      expect(detail).toContain(
        `git -c core.hooksPath=/dev/null -c submodule.recurse=false -C ${dir} switch --discard-changes --no-overwrite-ignore -c feature ${from}`,
      );
    });

    it("keeps an existing kept branch out of the head-moved command's way", () => {
      const { dir, head, base } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);

      const mine = commit(dir, { "mine.txt": "m\n" });

      git(dir, "branch", `pr-review-kept-${mine.slice(0, 12)}`, base);

      const declined = listAt(run(dir, ["restore"]).json, "declined");

      runPrinted(String(declined[0]?.command), dir);

      expect(branchOf(dir)).toBe("main");
      expect(git(dir, "rev-parse", `pr-review-kept-${mine.slice(0, 12)}`)).toBe(
        mine,
      );
    });

    it("carries -C on every git of a printed command", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });

      enter(dir, "checkout", head);
      commit(dir, { "mine.txt": "m\n" });

      const command = String(
        listAt(run(dir, ["restore"]).json, "declined")[0]?.command,
      );

      for (const part of command.split(" && ")) {
        expect(part).toMatch(/^git (.* )?-C \S+ /);
      }
    });
  });
});
