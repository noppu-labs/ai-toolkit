import { ArrowUp } from "lucide-react";
import type { ReactElement } from "react";
import { GitHubMark } from "@/components/GitHubMark";
import { Logo } from "@/components/Logo";
import { REPO_URL } from "@/lib/repo";
import { goToTop } from "@/lib/scroll";

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

/** The skip link's target, `<main id="main">` in `App.tsx`. */
const MAIN_ID = "main";

function handleBackToTop(): void {
  goToTop(MAIN_ID);
}

const FOCUS_ON_INK =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink";

export function Footer(): ReactElement {
  return (
    <footer className="border-border border-t-3 bg-ink text-white">
      <div className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-6 px-4 pt-8 pb-7 sm:px-6 md:gap-8 md:py-14">
        <div className="flex items-center gap-3 md:gap-4">
          <Logo
            className="size-14 shadow-[3px_3px_0px_0px_var(--color-white)] md:size-18 md:shadow-[4px_4px_0px_0px_var(--color-white)]"
            inverse
            mark="face"
            size="lg"
          />
          <p className="flex flex-col gap-0.75 md:gap-1">
            <span className="font-heading text-[19px] tracking-[-0.02em] md:text-2xl">
              AI Toolkit{" "}
              <span className="font-medium text-white/85">by Noppu Labs</span>
            </span>
            <span className="font-mono text-white/85 text-xs leading-[1.4] md:text-[13px] md:leading-normal">
              Deep code review and grounded investigation for coding agents.
            </span>
          </p>
        </div>
        <ul className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:flex-wrap">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <a
                className={`flex min-h-11 items-center justify-center gap-2 rounded-base border-2 border-white px-3.5 py-2.5 font-bold transition-colors hover:bg-white hover:text-black md:inline-flex ${FOCUS_ON_INK}`}
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
        <button
          className={`-mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-base border-2 border-border bg-main font-heading text-[15px] text-main-foreground shadow-[3px_3px_0px_0px_var(--color-white)] md:hidden [&_svg]:size-4 ${FOCUS_ON_INK}`}
          onClick={handleBackToTop}
          type="button"
        >
          Back to top
          <ArrowUp aria-hidden="true" strokeWidth={2.5} />
        </button>
      </div>
    </footer>
  );
}
