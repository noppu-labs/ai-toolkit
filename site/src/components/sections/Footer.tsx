import type { ReactElement } from "react";
import { Separator } from "@/components/ui/separator";

const FOOTER_LINKS = [
  { label: "GitHub", href: "https://github.com/noppu-labs/ai-toolkit" },
  {
    label: "License",
    href: "https://github.com/noppu-labs/ai-toolkit/blob/main/LICENSE",
  },
  {
    label: "Contributing",
    href: "https://github.com/noppu-labs/ai-toolkit/blob/main/CONTRIBUTING.md",
  },
  {
    label: "Releases",
    href: "https://github.com/noppu-labs/ai-toolkit/releases",
  },
];

export function Footer(): ReactElement {
  return (
    <footer>
      <Separator />
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8">
        <p className="text-muted-foreground text-sm">Noppu Labs — AI Toolkit</p>
        <ul className="flex flex-wrap gap-4">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <a
                className="text-muted-foreground text-sm hover:text-foreground"
                href={link.href}
                rel="noreferrer"
                target="_blank"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
