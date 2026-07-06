// Jazzer.js fuzz target (run via @jazzer.js/jest-runner): hashFiles must always
// produce a 64-char hex digest and must never throw on arbitrary path/content
// pairs (path-injection resistance, see skills-sync.ts:92).
import { FuzzedDataProvider } from "@jazzer.js/core";
import "@jazzer.js/jest-runner";
import { hashFiles } from "../skills-sync.ts";

const SHA256_HEX = /^[0-9a-f]{64}$/;

describe("skills-sync fuzz", () => {
  it.fuzz(
    "hashFiles tolerates arbitrary path/content pairs",
    (data: Buffer) => {
      const provider = new FuzzedDataProvider(data);
      const count = provider.consumeIntegralInRange(0, 8);
      const files = new Map<string, Buffer>();
      for (let i = 0; i < count; i++) {
        const path = provider.consumeString(32);
        const content = Buffer.from(provider.consumeBytes(32));
        files.set(path, content);
      }
      const digest = hashFiles(files);
      if (!SHA256_HEX.test(digest)) {
        throw new Error(`hashFiles returned non-sha256 digest: ${digest}`);
      }
    },
  );
});
