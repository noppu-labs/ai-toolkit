import { parse } from "yaml";
import cacheManagerYaml from "@/lib/__fixtures__/opencode-cache-manager.toolkit-page.yaml?raw";
import reviewerYaml from "@/lib/__fixtures__/opencode-permission-reviewer.toolkit-page.yaml?raw";
import type { OpenCodePage } from "@/lib/load-opencode";
import type { OpenCodePlugin } from "@/lib/opencode";
import {
  type RawManifest,
  rawManifestSchema,
  YAML_OPTIONS,
} from "@/lib/opencode-schema";

/** What Astro's `image()` gives for a path: the emitted URL and the image's size. */
function emitted(path: string, width: number, height: number): ImageMetadata {
  const file = path.split("/").at(-1) ?? path;
  return {
    src: `/_astro/${file}`,
    width,
    height,
    format: file.endsWith(".svg") ? "svg" : "png",
  };
}

/** A manifest as the `opencode` collection reads it, with its images resolved. */
function collectionPage(source: string): OpenCodePage {
  const raw: RawManifest = rawManifestSchema.parse(parse(source, YAML_OPTIONS));
  const { figure, ...howItWorks } = raw.howItWorks;
  return {
    ...raw,
    image: { ...raw.image, src: emitted(raw.image.src, 1280, 640) },
    howItWorks:
      figure === undefined
        ? howItWorks
        : {
            ...howItWorks,
            figure: { ...figure, src: emitted(figure.src, 882, 201) },
          },
  };
}

/** The permission reviewer's draft manifest: two install hosts, a figure, a config and a FAQ. */
export const REVIEWER_PLUGIN: OpenCodePlugin<OpenCodePage> = {
  name: "opencode-permission-reviewer",
  repo: "noppu-labs/opencode-permission-reviewer",
  package: "@noppu-labs/opencode-permission-reviewer",
  version: "3.4.1",
  license: "MIT AND Apache-2.0",
  page: collectionPage(reviewerYaml),
};

/** The cache manager's draft manifest: one install host. */
export const CACHE_MANAGER_PLUGIN: OpenCodePlugin<OpenCodePage> = {
  name: "opencode-cache-manager",
  repo: "noppu-labs/opencode-cache-manager",
  package: "@noppu-labs/opencode-cache-manager",
  version: "0.8.1",
  license: "MIT",
  page: collectionPage(cacheManagerYaml),
};
