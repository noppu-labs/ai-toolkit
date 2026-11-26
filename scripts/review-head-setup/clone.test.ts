import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  branchOf,
  enter,
  type Fixture,
  git,
  headOf,
  listAt,
  makeBin,
  makeFixture,
  nextPath,
  pathOf,
  readRecord,
  recordPath,
  registerSandbox,
  run,
  sandbox,
  scratchEntries,
  write,
  writeRecord,
} from "./helpers.ts";

registerSandbox();

describe("head-setup.mjs", () => {
  describe("enter clone", () => {
    function makeSource(): Fixture {
      const fixture = makeFixture({}, { "b.txt": "b\n" });

      git(
        fixture.dir,
        "remote",
        "add",
        "origin",
        "https://example.com/org/repo.git",
      );

      return fixture;
    }

    it("clones at the head with the source's origin URL", () => {
      const { dir, head } = makeSource();
      const entered = enter(dir, "clone", head);
      const path = pathOf(entered);

      expect(entered.status).toBe(0);
      expect(entered.json).toMatchObject({
        kind: "clone",
        headSha: head,
      });
      expect(entered.json).not.toHaveProperty("originRefsAreLocal");
      expect(headOf(path)).toBe(head);
      expect(branchOf(path)).toBe("");
      expect(git(path, "config", "--get", "remote.origin.url")).toBe(
        "https://example.com/org/repo.git",
      );
      expect(existsSync(join(path, "b.txt"))).toBe(true);
    });

    it("refuses a shallow source before creating anything", () => {
      const { dir } = makeSource();
      const shallow = nextPath("shallow");

      git(dir, "config", "protocol.file.allow", "always");
      git(dir, "clone", "-q", "--depth", "1", `file://${dir}`, shallow);

      const outcome = enter(shallow, "clone", headOf(shallow));

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({ reason: "shallow-source" });
      expect(existsSync(recordPath(shallow))).toBe(false);
      expect(
        scratchEntries().filter((name) => name.startsWith("pr-review-")),
      ).toEqual([]);
    });

    it("refuses a partial source cloned with a filter", () => {
      const { dir } = makeSource();
      const partial = nextPath("partial");

      git(dir, "config", "uploadpack.allowFilter", "true");
      git(
        dir,
        "clone",
        "-q",
        "--filter=blob:none",
        "--no-checkout",
        `file://${dir}`,
        partial,
      );

      const outcome = enter(partial, "clone", headOf(partial));

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({ reason: "partial-source" });
      expect(
        scratchEntries().filter((name) => name.startsWith("pr-review-")),
      ).toEqual([]);
    });

    it.each([
      ["remote.origin.promisor", "true"],
      ["extensions.partialClone", "origin"],
    ])("refuses a source with %s set", (key, value) => {
      const { dir, head } = makeSource();

      git(dir, "config", key, value);

      const outcome = enter(dir, "clone", head);

      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({ reason: "partial-source" });
    });

    it.each([
      ["a file the switch left missing", "/bin/rm -f b.txt"],
      ["an untracked file the switch left", "/usr/bin/touch stray.txt"],
    ])("removes the clone and refuses when it holds %s", (_label, damage) => {
      const { dir, head } = makeSource();
      const wrapper = `#!/bin/sh\nREAL_GIT "$@"\nrc=$?\ncase "$*" in\n*" switch "*) ${damage};;\nesac\nexit $rc\n`;
      const outcome = run(dir, ["enter", "clone", head], makeBin(wrapper));
      expect(outcome.status).toBe(1);
      expect(outcome.json).toMatchObject({ reason: "setup-failed" });
      expect(String(outcome.json.detail)).toContain("differs from the head");
      expect(
        scratchEntries().filter((name) => name.startsWith("pr-review-")),
      ).toEqual([]);
      expect(existsSync(recordPath(dir))).toBe(false);
    });

    it("leaves the source repository's config and hooks alone when an install writes .git", () => {
      const { dir, head } = makeSource();
      const sourceGit = join(dir, ".git");
      const before = [
        readFileSync(join(sourceGit, "config"), "utf8"),
        readdirSync(join(sourceGit, "hooks")).sort().join(","),
      ];
      const path = pathOf(enter(dir, "clone", head));

      git(path, "config", "core.hooksPath", "/tmp/evil");
      git(path, "config", "install.wrote", "yes");
      writeFileSync(
        join(path, ".git", "hooks", "post-checkout"),
        "#!/bin/sh\n",
      );

      expect([
        readFileSync(join(sourceGit, "config"), "utf8"),
        readdirSync(join(sourceGit, "hooks")).sort().join(","),
      ]).toEqual(before);
      expect(branchOf(dir)).toBe("main");
    });

    it("deletes the clone and its scratch directory on restore", () => {
      const { dir, head } = makeSource();
      const path = pathOf(enter(dir, "clone", head));

      write(path, "node_modules/x/y.js", "x\n");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(0);
      expect(existsSync(path)).toBe(false);
      expect(
        scratchEntries().filter((name) => name.startsWith("pr-review-")),
      ).toEqual([]);
    });

    it("refuses to delete a pr-review directory without the marker, even with a matching root", () => {
      const { dir, head } = makeSource();
      const parent = join(sandbox, "pr-review-victim-root");
      const path = join(parent, "head");

      mkdirSync(path, { recursive: true });
      write(path, "keep.txt", "x\n");
      writeRecord(dir, {
        version: 1,
        entries: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            kind: "clone",
            headSha: head,
            root: sandbox,
            path,
            parent,
          },
        ],
      });

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "not-ours" },
      ]);
      expect(existsSync(join(path, "keep.txt"))).toBe(true);
    });

    it("refuses to delete when the marker does not match", () => {
      const { dir, head } = makeSource();
      const path = pathOf(enter(dir, "clone", head));

      writeFileSync(join(dirname(path), ".pr-review-marker"), "someone-else");

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "not-ours" },
      ]);
      expect(existsSync(path)).toBe(true);
    });

    it("refuses to delete when the clone path became a symlink", () => {
      const { dir, head } = makeSource();
      const path = pathOf(enter(dir, "clone", head));
      const victim = nextPath("victim");

      mkdirSync(victim);
      write(victim, "keep.txt", "x\n");
      rmSync(path, { recursive: true });
      symlinkSync(victim, path);

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(listAt(outcome.json, "declined")).toMatchObject([
        { reason: "not-ours" },
      ]);
      expect(existsSync(join(victim, "keep.txt"))).toBe(true);
    });

    it("refuses to delete when the scratch directory became a symlink", () => {
      const { dir, head } = makeSource();
      const path = pathOf(enter(dir, "clone", head));
      const parent = dirname(path);
      const victim = nextPath("pr-review-victim");

      mkdirSync(join(victim, "head"), { recursive: true });
      write(join(victim, "head"), "keep.txt", "x\n");
      writeFileSync(
        join(victim, ".pr-review-marker"),
        String(readRecord(dir).entries[0]?.id),
      );
      rmSync(parent, { recursive: true });
      symlinkSync(victim, parent);

      const outcome = run(dir, ["restore"]);

      expect(outcome.status).toBe(1);
      expect(existsSync(join(victim, "head", "keep.txt"))).toBe(true);
    });

    it("keeps the clone's switch free of hooks and submodule recursion", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const hooks = nextPath("hooks");
      const log = nextPath("hook-log");
      const config = nextPath("global-config");

      mkdirSync(hooks);
      writeFileSync(
        join(hooks, "post-checkout"),
        `#!/bin/sh\necho ran >> "${log}"\n`,
      );
      chmodSync(join(hooks, "post-checkout"), 0o755);
      writeFileSync(config, `[core]\n\thooksPath = ${hooks}\n`);

      const outcome = run(dir, ["enter", "clone", head], makeBin(), {
        GIT_CONFIG_GLOBAL: config,
      });

      expect(outcome.status).toBe(0);
      expect(existsSync(log)).toBe(false);
    });

    it("never hands an origin URL that starts with a dash to remote set-url", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const log = nextPath("git-log");
      const spy = `#!/bin/sh\necho "$*" >> "${log}"\nexec REAL_GIT "$@"\n`;

      git(dir, "remote", "add", "origin", "https://example.com/x.git");
      git(dir, "config", "remote.origin.url", "--upload-pack=touch-it");

      const outcome = run(dir, ["enter", "clone", head], makeBin(spy));

      expect(outcome.status).toBe(0);
      expect(readFileSync(log, "utf8")).not.toContain("set-url");
    });

    it("sets the clone's origin to a URL that does not start with a dash", () => {
      const { dir, head } = makeFixture({}, { "b.txt": "b\n" });
      const log = nextPath("git-log");
      const spy = `#!/bin/sh\necho "$*" >> "${log}"\nexec REAL_GIT "$@"\n`;

      git(dir, "remote", "add", "origin", "https://example.com/x.git");

      run(dir, ["enter", "clone", head], makeBin(spy));

      expect(readFileSync(log, "utf8")).toContain(
        "remote set-url origin https://example.com/x.git",
      );
    });
  });
});
