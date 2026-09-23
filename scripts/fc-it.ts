// The `it` every script test imports: vitest's own, so an example test runs
// once, plus `it.prop` from @fast-check/vitest for properties. The
// @fast-check/vitest `it` repeats every body numRuns times, so under
// FC_NUM_RUNS (see fc-setup.ts) each example test that spawns git or a CLI
// ran as often as a property.
import { it as fcIt } from "@fast-check/vitest";
import { it as vitestIt } from "vitest";

export const it = Object.assign(vitestIt.extend({}), { prop: fcIt.prop });
