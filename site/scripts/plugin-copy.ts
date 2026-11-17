import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";
import { YAML_OPTIONS } from "../src/lib/opencode-schema.ts";
import {
  type PluginPageCopy,
  pluginPageSchema,
} from "../src/lib/plugin-page-schema.ts";

export const PLUGIN_COPY_DIR = "src/content/plugins";

/** Every plugin's page copy, sorted by plugin name. */
export function readPluginCopy(
  siteDir: string,
): { name: string; copy: PluginPageCopy }[] {
  const dir = join(siteDir, PLUGIN_COPY_DIR);
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((file) => file.endsWith(".yaml"))
    .map((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      let data: unknown;
      try {
        data = parse(text, YAML_OPTIONS);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        throw new Error(`${file}: ${message}`, { cause: error });
      }

      const result = pluginPageSchema.safeParse(data);
      if (!result.success) {
        throw new Error(`${file}: ${result.error.message}`);
      }

      return { name: basename(file, ".yaml"), copy: result.data };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
