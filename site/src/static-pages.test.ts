import { describe, expect, it } from "vitest";
import { REPO_URL } from "@/lib/repo";

async function publicFile(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  return response.text();
}

describe("404.html", () => {
  it("links home, to the skills and to the repo, with root-relative links that work at any depth", async () => {
    const doc = new DOMParser().parseFromString(
      await publicFile("/404.html"),
      "text/html",
    );
    const links = [...doc.querySelectorAll("a")].map((link) =>
      link.getAttribute("href"),
    );

    expect(doc.querySelector("h1")?.textContent).toBe("This page wandered off");
    expect(links).toEqual(["/", "/", "/#skills", REPO_URL]);
    const local = [...doc.querySelectorAll("[src], link[href]")].map(
      (element) => element.getAttribute("src") ?? element.getAttribute("href"),
    );
    expect(local.every((url) => url?.startsWith("/"))).toBe(true);
  });

  it("stands alone, without the app's scripts or stylesheets", async () => {
    const doc = new DOMParser().parseFromString(
      await publicFile("/404.html"),
      "text/html",
    );

    expect(doc.querySelectorAll("script, link[rel='stylesheet']")).toHaveLength(
      0,
    );
  });
});
