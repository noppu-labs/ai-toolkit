import { extname, posix } from "node:path";

type ImageField = "image.src" | "howItWorks.figure.src";

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const RASTER = [".png", ".jpg", ".jpeg"];
const ALLOWED: Record<ImageField, readonly string[]> = {
  "image.src": RASTER,
  "howItWorks.figure.src": [...RASTER, ".svg"],
};

function problem(path: string, field: ImageField): string | undefined {
  if (path.includes("\\")) {
    return "has a backslash";
  }
  if (path.startsWith("/")) {
    return "is absolute";
  }
  const normal = posix.normalize(path);
  if (normal === ".." || normal.startsWith("../")) {
    return "leaves docs/";
  }
  if (!normal.split("/").every((segment) => SEGMENT.test(segment))) {
    return "has a segment outside A-Z a-z 0-9 . _ -";
  }
  if (!ALLOWED[field].includes(extname(normal).toLowerCase())) {
    return `must end in ${ALLOWED[field].join(", ")}`;
  }
  return undefined;
}

/** The repo-relative path of a manifest image, anchored in `docs/`. */
export function imageRepoPath(manifestPath: string, field: ImageField): string {
  const reason = problem(manifestPath, field);
  if (reason !== undefined) {
    throw new Error(`${field}: ${manifestPath} ${reason}`);
  }
  return posix.join("docs", posix.normalize(manifestPath));
}
