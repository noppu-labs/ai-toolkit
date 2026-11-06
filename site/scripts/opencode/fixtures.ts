import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import type { GitRunner } from "./sources.ts";

/** A response the fake fetcher sends for one URL. */
export interface Reply {
  body: string | Uint8Array;
  status?: number;
}

/** An in-memory npm registry, GitHub raw host and `git ls-remote`. */
export interface World {
  routes: Map<string, Reply>;
  refs: Map<string, string>;
  fetcher: typeof fetch;
  git: GitRunner;
}

const GITHUB = "https://github.com/";
const RAW = "https://raw.githubusercontent.com/";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function commitOf(letter: string): string {
  return letter.repeat(40);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A PNG with the given size: the IHDR chunk and an empty IEND, enough to sniff. */
export function png(width: number, height: number): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk("IHDR", header),
    chunk("IEND", new Uint8Array(0)),
  ];
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

export function fixtureManifest(
  fixture = "opencode-permission-reviewer",
): string {
  return readFileSync(
    new URL(
      `../../src/lib/__fixtures__/${fixture}.toolkit-page.yaml`,
      import.meta.url,
    ),
    "utf8",
  );
}

export const FIGURE_PATH = "docs/images/result-attribution.svg";
export const HERO_PATH = "docs/images/social-preview.png";

export function figureSvg(extra = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" ${extra}><rect width="1" height="1"/></svg>`;
}

export function newWorld(): World {
  const routes = new Map<string, Reply>();
  const refs = new Map<string, string>();
  const fetcher = ((input: string | URL | Request): Promise<Response> => {
    const reply = routes.get(String(input));
    if (reply === undefined) {
      return Promise.resolve(new Response("not found", { status: 404 }));
    }
    return Promise.resolve(
      new Response(reply.body as BodyInit, { status: reply.status ?? 200 }),
    );
  }) as typeof fetch;
  const git: GitRunner = (args: readonly string[]): Promise<string> => {
    const repo = (args[1] ?? "").slice(GITHUB.length);
    const lines = args
      .slice(2)
      .map((spec) => [refs.get(`${repo} ${spec}`), spec] as const)
      .filter(([sha]) => sha !== undefined)
      .map(([sha, spec]) => `${sha}\t${spec}`);
    return Promise.resolve(lines.join("\n"));
  };
  return { routes, refs, fetcher, git };
}

export function setLatest(world: World, pkg: string, version: string): void {
  world.routes.set(
    `https://registry.npmjs.org/-/package/${pkg.replace("/", "%2F")}/dist-tags`,
    { body: JSON.stringify({ latest: version }) },
  );
}

/** Publishes a repo at one commit under a tag or branch, with its files. */
export function setRepo(
  world: World,
  repo: string,
  ref: string,
  commit: string,
  files: Record<string, string | Uint8Array>,
): void {
  const spec = ref.startsWith("v") ? `refs/tags/${ref}` : `refs/heads/${ref}`;
  world.refs.set(`${repo} ${spec}`, commit);
  for (const [path, body] of Object.entries(files)) {
    world.routes.set(`${RAW}${repo}/${commit}/${path}`, { body });
  }
}

/** The files of a healthy plugin repo at `version`. */
export function pluginFiles(
  name: string,
  version: string,
): Record<string, string | Uint8Array> {
  return {
    "package.json": JSON.stringify({
      name: `@noppu-labs/${name}`,
      version,
      license: "MIT",
    }),
    "docs/toolkit-page.yaml": fixtureManifest(),
    [HERO_PATH]: png(1200, 630),
    [FIGURE_PATH]: figureSvg(),
  };
}

/** Registers `name` as released: npm latest, the tag and its files. */
export function release(
  world: World,
  name: string,
  version: string,
  commit: string,
): void {
  setLatest(world, `@noppu-labs/${name}`, version);
  setRepo(
    world,
    `noppu-labs/${name}`,
    `v${version}`,
    commit,
    pluginFiles(name, version),
  );
}
