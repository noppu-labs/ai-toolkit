// A tracked `.env` in any case, even a symlink, would take the copy `cp <example> .env`
// makes: through a symlink that writes to a file outside the tree.
export function findEnvExample(src) {
  if (src.paths().some((path) => path.toLowerCase() === ".env")) {
    return null;
  }

  return (
    [".env.example", ".env.dist"].find(
      (file) => src.has(file) && src.admit(file),
    ) ?? null
  );
}
