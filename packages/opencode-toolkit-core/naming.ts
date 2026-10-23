export const NAMESPACES: readonly string[] = ["review", "investigate"];

// The review package keeps its bare ids for backward compatibility; every
// other namespace is prefixed so ids from different packages cannot collide.
export function makeSkillId(namespace: string, skill: string): string {
  if (!NAMESPACES.includes(namespace)) {
    throw new Error(
      `Unknown skill namespace ${namespace}; add it to NAMESPACES`,
    );
  }

  return namespace === "review" ? skill : `${namespace}-${skill}`;
}
