import { type CollectionEntry, getCollection } from "astro:content";
import lockJson from "../../opencode-lock.json";
import { joinOpenCodePlugins, type OpenCodePlugin } from "./opencode.ts";
import { lockSchema } from "./opencode-lock.ts";

export type OpenCodePage = CollectionEntry<"opencode">["data"];

const MIN_IMAGE_WIDTH = 1200;
const MIN_IMAGE_HEIGHT = 600;

export async function loadOpenCodePlugins(): Promise<
  OpenCodePlugin<OpenCodePage>[]
> {
  const entries = await getCollection("opencode");
  const plugins = joinOpenCodePlugins(entries, lockSchema.parse(lockJson));
  for (const { name, page } of plugins) {
    const { width, height } = page.image.src;
    if (width < MIN_IMAGE_WIDTH || height < MIN_IMAGE_HEIGHT) {
      throw new Error(`${name}: image.src must be at least 1200 × 600`);
    }
  }
  return plugins;
}
