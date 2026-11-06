import { createHash } from "node:crypto";
import { imageMetadata } from "astro/assets/utils";
import { z } from "astro/zod";
import { parse } from "yaml";
import {
  type LockEntry,
  lockEntrySchema,
} from "../../src/lib/opencode-lock.ts";
import {
  MANIFEST_PATH,
  manifestImages,
  type RawManifest,
  rawManifestSchema,
  YAML_OPTIONS,
} from "../../src/lib/opencode-schema.ts";
import { imageRepoPath } from "./paths.ts";
import {
  type Fetcher,
  fetchRepoFile,
  type GitRunner,
  npmLatestVersion,
  resolveCommit,
} from "./sources.ts";
import { svgHasActiveContent } from "./svg.ts";

export interface FetchedPlugin {
  entry: LockEntry;
  files: Map<string, Uint8Array>;
}

interface Deps {
  fetcher: Fetcher;
  git: GitRunner;
}

interface Source {
  repo: string;
  package: string;
}

interface FetchedImage {
  field: "image.src" | "howItWorks.figure.src";
  repoPath: string;
  bytes: Uint8Array;
}

const MIN_HERO_WIDTH = 1200;
const MIN_HERO_HEIGHT = 600;

const packageJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  license: z.string().min(1),
});

const decoder = new TextDecoder();

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertRepoName(name: string, repo: string): void {
  if (repo.split("/")[1] !== name) {
    throw new Error(`${name}: repo ${repo} is not named ${name}`);
  }
}

function readPackageJson(
  name: string,
  source: Source,
  tag: string,
  ref: string | undefined,
  bytes: Uint8Array,
): z.infer<typeof packageJsonSchema> {
  const pkg = packageJsonSchema.parse(JSON.parse(decoder.decode(bytes)));
  if (pkg.name !== source.package) {
    throw new Error(
      `${name}: package.json name is ${pkg.name}, expected ${source.package}`,
    );
  }
  if (ref === undefined && `v${pkg.version}` !== tag) {
    throw new Error(
      `${name}: package.json version is ${pkg.version}, tag is ${tag}`,
    );
  }
  return pkg;
}

function readManifest(name: string, bytes: Uint8Array): RawManifest {
  const result = rawManifestSchema.safeParse(
    parse(decoder.decode(bytes), YAML_OPTIONS),
  );
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.map(String).join(".") ?? "";
    throw new Error(`${name}: ${where}: ${issue?.message ?? "invalid"}`);
  }
  return result.data;
}

function anchoredPath(
  name: string,
  field: FetchedImage["field"],
  path: string,
): string {
  try {
    return imageRepoPath(path, field);
  } catch (error) {
    throw new Error(`${name}: ${(error as Error).message}`, { cause: error });
  }
}

function fetchImages(
  name: string,
  manifest: RawManifest,
  read: (path: string) => Promise<Uint8Array>,
): Promise<FetchedImage[]> {
  return Promise.all(
    manifestImages(manifest).map(async ({ field, path }) => {
      const repoPath = anchoredPath(name, field, path);
      try {
        return { field, repoPath, bytes: await read(repoPath) };
      } catch (error) {
        throw new Error(`${name}: ${field}: ${(error as Error).message}`, {
          cause: error,
        });
      }
    }),
  );
}

async function assertHeroSize(
  name: string,
  images: readonly FetchedImage[],
): Promise<void> {
  const hero = images.find((image) => image.field === "image.src");
  if (hero === undefined) {
    return;
  }
  const { width, height } = await imageMetadata(hero.bytes, hero.repoPath);
  if (width < MIN_HERO_WIDTH || height < MIN_HERO_HEIGHT) {
    throw new Error(`${name}: image.src: must be at least 1200 × 600`);
  }
}

function assertFigureIsInert(
  name: string,
  images: readonly FetchedImage[],
): void {
  const figure = images.find(
    (image) => image.field === "howItWorks.figure.src",
  );
  if (
    figure?.repoPath.toLowerCase().endsWith(".svg") === true &&
    svgHasActiveContent(figure.bytes)
  ) {
    throw new Error(`${name}: howItWorks.figure.src: SVG has active content`);
  }
}

/** The plugin's lock entry, checked so the sync never writes one `--check` cannot read. */
function lockEntry(
  name: string,
  source: Source,
  details: {
    pkg: z.infer<typeof packageJsonSchema>;
    tag: string;
    commit: string;
    ref: string | undefined;
    files: Map<string, Uint8Array>;
  },
): LockEntry {
  const { pkg, tag, commit, ref, files } = details;
  const result = lockEntrySchema.safeParse({
    repo: source.repo,
    package: source.package,
    version: pkg.version,
    tag,
    commit,
    license: pkg.license,
    ...(ref === undefined ? {} : { ref }),
    files: Object.fromEntries(
      [...files].map(([path, bytes]) => [path, hash(bytes)]),
    ),
  });
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.map(String).join(".") ?? "";
    throw new Error(
      `${name}: lock entry ${where}: ${issue?.message ?? "invalid"}`,
    );
  }
  return result.data;
}

/** Reads one plugin at its release (or `ref`) and checks everything the page needs. */
export async function fetchPlugin(
  name: string,
  source: Source,
  deps: Deps,
  ref?: string,
): Promise<FetchedPlugin> {
  assertRepoName(name, source.repo);
  const tag = ref ?? `v${await npmLatestVersion(source.package, deps.fetcher)}`;
  const commit = await resolveCommit(source.repo, tag, deps.git);
  const read = (path: string): Promise<Uint8Array> =>
    fetchRepoFile(source.repo, commit, path, deps.fetcher);
  const pkg = readPackageJson(
    name,
    source,
    tag,
    ref,
    await read("package.json"),
  );
  const manifestBytes = await read(MANIFEST_PATH);
  const manifest = readManifest(name, manifestBytes);
  const images = await fetchImages(name, manifest, read);
  await assertHeroSize(name, images);
  assertFigureIsInert(name, images);
  const files = new Map<string, Uint8Array>([
    [MANIFEST_PATH, manifestBytes],
    ...images.map((image): [string, Uint8Array] => [
      image.repoPath,
      image.bytes,
    ]),
  ]);
  const entry = lockEntry(name, source, { pkg, tag, commit, ref, files });
  return { entry, files };
}
