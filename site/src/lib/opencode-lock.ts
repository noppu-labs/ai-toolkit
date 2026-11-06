import { z } from "astro/zod";

export const PLUGIN_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const repo = z.string().regex(REPO_PATTERN);
const packageName = z.string().min(1);

/** What the sync reads for each plugin: where it lives and what it publishes. */
export const lockSourceSchema = z
  .object({ repo, package: packageName })
  .loose();

export const lockEntrySchema = z
  .object({
    repo,
    package: packageName,
    version: z.string().regex(VERSION_PATTERN),
    tag: z.string().min(1),
    commit: z.string().regex(COMMIT_PATTERN),
    license: z.string().min(1),
    ref: z.string().min(1).optional(),
    files: z.record(z.string().min(1), z.string().regex(SHA256_PATTERN)),
  })
  .strict();

function lockOf<E extends z.ZodType>(
  entry: E,
): z.ZodObject<
  {
    lockfileVersion: z.ZodLiteral<1>;
    plugins: z.ZodRecord<z.ZodString, E>;
  },
  z.core.$strict
> {
  return z
    .object({
      lockfileVersion: z.literal(1),
      plugins: z.record(z.string().regex(PLUGIN_NAME_PATTERN), entry),
    })
    .strict();
}

export const lockSchema = lockOf(lockEntrySchema);

export const lockSourcesSchema = lockOf(lockSourceSchema);

export type LockEntry = z.infer<typeof lockEntrySchema>;
export type OpenCodeLock = z.infer<typeof lockSchema>;
export type LockSources = z.infer<typeof lockSourcesSchema>;
