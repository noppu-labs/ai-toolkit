import { describe, expect, it } from "vitest";
import { imageRepoPath } from "./paths.ts";

describe("imageRepoPath", () => {
  it("anchors the path in docs/ and normalises it", () => {
    expect(imageRepoPath("images/a.png", "image.src")).toBe(
      "docs/images/a.png",
    );
    expect(imageRepoPath("./images/../a.png", "image.src")).toBe("docs/a.png");
  });

  it.each([
    ["../../package.json", "leaves docs/"],
    ["/etc/passwd", "absolute"],
    ["images\\x.png", "backslash"],
    ["images/a.gif", "extension"],
    ["images/a.svg", "extension"],
  ])("rejects %s for image.src", (path) => {
    expect(() => imageRepoPath(path, "image.src")).toThrow(
      new RegExp(`^image\\.src: ${path.replace(/[\\.]/g, "\\$&")} `),
    );
  });

  it("accepts an SVG for the figure only", () => {
    expect(imageRepoPath("images/a.svg", "howItWorks.figure.src")).toBe(
      "docs/images/a.svg",
    );
    expect(imageRepoPath("images/A.JPEG", "image.src")).toBe(
      "docs/images/A.JPEG",
    );
  });
});

describe("imageRepoPath encoded and URL characters", () => {
  it.each([
    "%2e%2e/%2e%2e/%2e%2e/%2e%2e/evil/repo/main/x.png",
    "images/%2e%2e/%2e%2e/package.json#.png",
    "images/.%2e/a.png",
    "images/x?.png",
    "images/a b.png",
    "images/./.hidden/a.png",
  ])("rejects %s", (path) => {
    expect(() => imageRepoPath(path, "image.src")).toThrow(
      `image.src: ${path} `,
    );
  });
});
