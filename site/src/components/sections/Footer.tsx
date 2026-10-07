import type { ReactElement } from "react";
import { GitHubMark } from "@/components/GitHubMark";
import { Logo } from "@/components/Logo";
import { REPO_URL } from "@/lib/repo";

const FOOTER_LINKS: { label: string; href: string; icon?: ReactElement }[] = [
  { label: "GitHub", href: REPO_URL, icon: <GitHubMark /> },
  {
    label: "License",
    href: `${REPO_URL}/blob/main/LICENSE`,
  },
  {
    label: "Contributing",
    href: `${REPO_URL}/blob/main/CONTRIBUTING.md`,
  },
  {
    label: "Releases",
    href: `${REPO_URL}/releases`,
  },
];

export function Footer(): ReactElement {
  return (
    <footer className="border-border border-t-3 bg-ink text-white">
      <div className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-8 px-4 py-14 sm:px-6">
        <div className="flex items-center gap-4">
          <Logo inverse mark="face" size="lg" />
          <p className="flex flex-col gap-1">
            <span className="font-heading text-2xl tracking-[-0.02em]">
              AI Toolkit{" "}
              <span className="font-medium text-white/85">by Noppu Labs</span>
            </span>
            <span className="font-mono text-[13px] text-white/85">
              Deep code review and grounded investigation for coding agents.
            </span>
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <a
                className="inline-flex min-h-11 items-center gap-2 rounded-base border-2 border-white px-3.5 py-2.5 font-bold transition-colors hover:bg-white hover:text-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                href={link.href}
                rel="noreferrer"
                target="_blank"
              >
                {link.icon}
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
