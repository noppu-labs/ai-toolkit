// Jazzer.js fuzz target for the functions in scripts/skills-sync.mjs that
// process third-party content: lock entries, upstream file listings, and
// upstream blobs fetched from external GitHub repos.
const modPromise = import("../scripts/skills-sync.mjs");

module.exports.fuzz = async (data) => {
  const { classify, fetchUpstream, hashFiles } = await modPromise;
  const input = data.toString("utf8");

  // Lock entries are JSON from disk; hashes are strings derived from content.
  try {
    const entry = JSON.parse(input);
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      classify(entry, entry.vendoredHash, entry.upstreamHash);
    }
  } catch (e) {
    // SyntaxError: invalid JSON; RangeError: JSON.parse stack overflow on
    // pathological nesting — both are harness artifacts, not target bugs.
    if (!(e instanceof SyntaxError || e instanceof RangeError)) throw e;
  }

  // File paths and contents come verbatim from upstream repos.
  hashFiles(new Map([[input.slice(0, 64), data]]));

  // Drive fetchUpstream with a fake gh API returning fuzzer-controlled
  // listings and blobs, as a hostile upstream repo could.
  try {
    const fake = (path) => {
      if (path.includes("/commits/")) {
        return { sha: "0000000000000000000000000000000000000000" };
      }
      if (path.includes("/contents/")) {
        return [{ path: `s/${input.slice(0, 32)}`, sha: "b1", type: "file" }];
      }
      return { content: input };
    };
    fetchUpstream({ ref: "main", skillPath: "s", source: "o/r" }, fake);
  } catch (e) {
    if (!String(e.message).startsWith("no files under")) throw e;
  }
};
