export const NAMESPACES: readonly string[] = ["review", "investigate"];

export function requireNamespace(namespace: string): void {
  if (!NAMESPACES.includes(namespace)) {
    throw new Error(
      `Unknown skill namespace ${namespace}; add it to NAMESPACES`,
    );
  }
}

// The review package keeps its bare ids for backward compatibility; every
// other namespace is prefixed so ids from different packages cannot collide.
export function makeSkillId(namespace: string, skill: string): string {
  requireNamespace(namespace);

  return namespace === "review" ? skill : `${namespace}-${skill}`;
}
