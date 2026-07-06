// Global fast-check configuration, loaded via vitest setupFiles. Normal test
// runs keep fast-check's default number of runs per property; setting
// FC_NUM_RUNS turns the same property tests into a fuzzing pass by executing
// each predicate against many more generated inputs
// (https://fast-check.dev/docs/advanced/fuzzing/). Run via `npm run fuzz`.
import fc from "fast-check";

const numRuns = Number(process.env.FC_NUM_RUNS);

if (Number.isInteger(numRuns) && numRuns > 0) {
  fc.configureGlobal({ numRuns });
}
