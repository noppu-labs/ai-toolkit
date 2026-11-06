import { describe, expect, it } from "vitest";
import { fetchPlugin } from "./fetch-plugin.ts";
import {
  commitOf,
  FIGURE_PATH,
  figureSvg,
  fixtureManifest,
  HERO_PATH,
  newWorld,
  pluginFiles,
  png,
  release,
  setRepo,
  sha256,
  type World,
} from "./fixtures.ts";

const NAME = "opencode-x";
const SOURCE = {
  repo: `noppu-labs/${NAME}`,
  package: `@noppu-labs/${NAME}`,
};

function run(world: World, ref?: string): ReturnType<typeof fetchPlugin> {
  return fetchPlugin(NAME, SOURCE, world, ref);
}

function released(
  files: Record<string, string | Uint8Array> = {},
  version = "1.2.3",
): World {
  const world = newWorld();
  release(world, NAME, version, commitOf("a"));
  setRepo(world, SOURCE.repo, `v${version}`, commitOf("a"), {
    ...pluginFiles(NAME, version),
    ...files,
  });
  return world;
}

describe("fetchPlugin", () => {
  it("reads the release and hashes every file", async () => {
    const { entry, files } = await run(released());
    expect(entry).toEqual({
      repo: SOURCE.repo,
      package: SOURCE.package,
      version: "1.2.3",
      tag: "v1.2.3",
      commit: commitOf("a"),
      license: "MIT",
      files: {
        "docs/toolkit-page.yaml": sha256(
          new TextEncoder().encode(fixtureManifest()),
        ),
        [HERO_PATH]: sha256(png(1200, 630)),
        [FIGURE_PATH]: sha256(new TextEncoder().encode(figureSvg())),
      },
    });
    expect([...files.keys()]).toEqual([
      "docs/toolkit-page.yaml",
      HERO_PATH,
      FIGURE_PATH,
    ]);
  });

  it("records a ref and uses it as the tag", async () => {
    const world = released();
    setRepo(
      world,
      SOURCE.repo,
      "feat/y",
      commitOf("b"),
      pluginFiles(NAME, "1.2.3"),
    );
    const { entry } = await run(world, "feat/y");
    expect(entry).toMatchObject({
      ref: "feat/y",
      tag: "feat/y",
      commit: commitOf("b"),
      version: "1.2.3",
    });
  });

  it("rejects a repo whose name differs from the plugin name", async () => {
    await expect(fetchPlugin("opencode-y", SOURCE, released())).rejects.toThrow(
      "opencode-y: ",
    );
  });

  it("rejects a package.json with another name", async () => {
    const world = released({
      "package.json": JSON.stringify({
        name: "other",
        version: "1.2.3",
        license: "MIT",
      }),
    });
    await expect(run(world)).rejects.toThrow(
      `${NAME}: package.json name is other, expected ${SOURCE.package}`,
    );
  });

  it("rejects a version that does not match the tag", async () => {
    const world = released({
      "package.json": JSON.stringify({
        name: SOURCE.package,
        version: "1.2.4",
        license: "MIT",
      }),
    });
    await expect(run(world)).rejects.toThrow(
      `${NAME}: package.json version is 1.2.4, tag is v1.2.3`,
    );
  });

  it("names the plugin and the field of a schema error", async () => {
    const world = released({
      "docs/toolkit-page.yaml": fixtureManifest().replace(
        /^ {2}title: .*$/m,
        "  title: short",
      ),
    });
    await expect(run(world)).rejects.toThrow(`${NAME}: seo.title:`);
  });

  it("names the path of a missing image", async () => {
    const world = released();
    world.routes.delete(
      `https://raw.githubusercontent.com/${SOURCE.repo}/${commitOf("a")}/${FIGURE_PATH}`,
    );
    await expect(run(world)).rejects.toThrow(`${FIGURE_PATH} returned 404`);
  });

  it("rejects a hero image under 1200 x 600", async () => {
    const world = released({ [HERO_PATH]: png(100, 50) });
    await expect(run(world)).rejects.toThrow(
      `${NAME}: image.src: must be at least 1200 × 600`,
    );
  });

  it("rejects an image path that leaves docs/", async () => {
    const world = released({
      "docs/toolkit-page.yaml": fixtureManifest().replace(
        "images/social-preview.png",
        "../../package.json",
      ),
    });
    await expect(run(world)).rejects.toThrow(
      `${NAME}: image.src: ../../package.json`,
    );
  });

  it.each([
    ["a script element", figureSvg("><script>alert(1)</script><g")],
    ["an event attribute", figureSvg('onload="x()"')],
    ["a javascript: URL", figureSvg('href="JavaScript:x()"')],
    ["a foreignObject", figureSvg("><foreignobject/><g")],
  ])("rejects an SVG figure with %s", async (_label, svg) => {
    const world = released({ [FIGURE_PATH]: svg });
    await expect(run(world)).rejects.toThrow(
      `${NAME}: howItWorks.figure.src: SVG has active content`,
    );
  });
});
