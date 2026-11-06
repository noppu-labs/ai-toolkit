import { ArrowUp } from "lucide-react";
import type { ReactElement } from "react";
import { GitHubMark } from "@/components/GitHubMark";
import { Logo } from "@/components/Logo";
import { OPENCODE_PATH } from "@/lib/opencode";
import { REPO_URL } from "@/lib/repo";
import { goToTop } from "@/lib/scroll";

interface FooterLink {
  label: string;
  href: string;
  /** Opens in a new tab: the link leaves the site. */
  external: boolean;
  icon?: ReactElement;
}

const FOOTER_LINKS: FooterLink[] = [
  { label: "OpenCode plugins", href: OPENCODE_PATH, external: false },
  { label: "GitHub", href: REPO_URL, external: true, icon: <GitHubMark /> },
  {
    label: "License",
    href: `${REPO_URL}/blob/main/LICENSE`,
    external: true,
  },
  {
    label: "Contributing",
    href: `${REPO_URL}/blob/main/CONTRIBUTING.md`,
    external: true,
  },
  {
    label: "Releases",
    href: `${REPO_URL}/releases`,
    external: true,
  },
];

/** The skip link's target, `<main id="main">` in `SiteFrame.tsx`. */
const MAIN_ID = "main";

function handleBackToTop(): void {
  goToTop(MAIN_ID);
}

const FOCUS_ON_INK =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink";

export function Footer(): ReactElement {
  return (
    <footer className="border-t-3 border-border bg-ink text-white">
      <div className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-6 px-4 pt-8 pb-7 sm:px-6 md:gap-8 md:py-14">
        <div className="flex items-center gap-3 md:gap-4">
          <Logo
            className="size-14 shadow-[3px_3px_0px_0px_var(--color-white)] md:size-18 md:shadow-[4px_4px_0px_0px_var(--color-white)]"
            inverse
            mark="face"
            size="lg"
          />
          <p className="flex flex-col gap-0.75 md:gap-1">
            <span className="text-[19px] font-heading tracking-[-0.02em] md:text-2xl">
              AI Toolkit{" "}
              <span className="font-medium text-white/85">by Noppu Labs</span>
            </span>
            <span className="font-mono text-xs leading-[1.4] text-white/85 md:text-[13px] md:leading-normal">
              Deep code review and grounded investigation for coding agents.
            </span>
          </p>
        </div>
        <ul className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:flex-wrap">
          {FOOTER_LINKS.map((link) => (
            <li
              className={link.external ? undefined : "col-span-2 md:col-span-1"}
              key={link.href}
            >
              <a
                className={`flex min-h-11 items-center justify-center gap-2 rounded-base border-2 border-white px-3.5 py-2.5 font-bold transition-colors hover:bg-white hover:text-black md:inline-flex ${FOCUS_ON_INK}`}
                href={link.href}
                {...(link.external
                  ? { rel: "noreferrer", target: "_blank" }
                  : {})}
              >
                {link.icon}
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <button
          className={`-mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-base border-2 border-border bg-main text-[15px] font-heading text-main-foreground shadow-[3px_3px_0px_0px_var(--color-white)] md:hidden [&_svg]:size-4 ${FOCUS_ON_INK}`}
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
