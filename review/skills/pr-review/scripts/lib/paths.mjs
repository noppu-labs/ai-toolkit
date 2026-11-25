import { posix } from "node:path";

const SAFE_PATH = /^[A-Za-z0-9._/@+ -]+$/;

export function isSafePath(path) {
  return (
    SAFE_PATH.test(path) &&
    !path.split("/").some((part) => part.startsWith("-"))
  );
}

export function isVendored(path) {
  const segments = path.split("/").slice(0, -1);

  return segments.includes("vendor") || segments.includes("node_modules");
}

export function dirOf(path) {
  const dir = posix.dirname(path);

  return dir === "." ? "" : dir;
}

export function pathIn(dir, name) {
  return dir === "" ? name : `${dir}/${name}`;
}
