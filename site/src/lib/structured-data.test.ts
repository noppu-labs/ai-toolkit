import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd } from "./structured-data.ts";

const CRUMBS = [
  { name: "Home", path: "/" },
  { name: "OpenCode", path: "/opencode" },
  { name: "OpenCode Cache Manager", path: "/opencode/opencode-cache-manager" },
] as const;

interface ListItem {
  "@type": string;
  position: number;
  name: string;
  item: string;
}

function listItems(text: string): ListItem[] {
  const data: { itemListElement: ListItem[] } = JSON.parse(text);
  return data.itemListElement;
}

describe("breadcrumbJsonLd", () => {
  it("lists the crumbs as a BreadcrumbList with absolute URLs", () => {
    const text = breadcrumbJsonLd(CRUMBS);

    expect(JSON.parse(text)).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
    });
    expect(listItems(text)).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://toolkit.noppu.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "OpenCode",
        item: "https://toolkit.noppu.com/opencode",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "OpenCode Cache Manager",
        item: "https://toolkit.noppu.com/opencode/opencode-cache-manager",
      },
    ]);
  });

  it("escapes < so a name can never close the script element", () => {
    const name = "a</script><b>";
    const text = breadcrumbJsonLd([{ name, path: "/" }]);

    expect(text).not.toContain("</script");
    expect(text).not.toContain("<");
    // Six characters for each `<`: a backslash, then u003c.
    expect(text).toContain(String.raw`a\u003c/script>\u003cb>`);
    expect(listItems(text)[0]?.name).toBe(name);
  });
});
