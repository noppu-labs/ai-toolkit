import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makePlugin } from "@noppu-labs/opencode-toolkit-core";

export default makePlugin({
  id: "noppu-labs.review",
  namespace: "review",
  packageRoot: resolve(fileURLToPath(new URL("..", import.meta.url))),
});
