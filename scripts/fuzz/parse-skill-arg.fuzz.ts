// Jazzer.js target: parseSkillArg must never crash on arbitrary input — it
// either returns a valid pair or throws a plain Error. Any other throw is a bug.
import { parseSkillArg } from "../skills-sync.ts";

export function fuzz(data: Buffer): void {
  try {
    parseSkillArg(data.toString("utf8"));
  } catch (error) {
    if (error instanceof Error) {
      return;
    }
    throw error;
  }
}
