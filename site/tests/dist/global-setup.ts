import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { preview } from "astro";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** Where `astro preview` serves `dist/`, with no trailing slash. */
    baseUrl: string;
  }
}

const root = fileURLToPath(new URL("../..", import.meta.url));

/** Serves the built site on a free port for the `dist` tests, and stops it after them. */
export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  if (!existsSync(new URL("../../dist/index.html", import.meta.url))) {
    throw new Error("site/dist is missing: run npm run build -w site first");
  }
  const server = await preview({ root, server: { port: 0 } });
  project.provide(
    "baseUrl",
    `http://${server.host ?? "localhost"}:${server.port}`,
  );
  return async (): Promise<void> => {
    await server.stop();
  };
}
