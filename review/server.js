// biome-ignore lint/performance/noBarrelFile: shipped root shim (package.json "files") re-exporting dist/index.js, for hosts that resolve plugins by filename
export { default } from "./dist/index.js";
