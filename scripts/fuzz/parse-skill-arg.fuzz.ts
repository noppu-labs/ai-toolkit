// Jazzer.js fuzz target (run via @jazzer.js/jest-runner): parseSkillArg must
// never crash on arbitrary input — it either returns a valid pair or throws a
// plain Error. Any other throw is a bug.
import "@jazzer.js/jest-runner";
import { parseSkillArg } from "../skills-sync.ts";

describe("skills-sync fuzz", () => {
  it.fuzz("parseSkillArg tolerates arbitrary CLI args", (data: Buffer) => {
    try {
      parseSkillArg(data.toString("utf8"));
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
    }
  });
});
