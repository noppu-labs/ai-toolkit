import { ArrowUpRight } from "lucide-react";
import type { ReactElement } from "react";
import { GitHubMark } from "@/components/GitHubMark";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buttonVariants } from "@/components/ui/button-variants";
import { REPO_URL } from "@/lib/repo";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Plugins", href: "#plugins" },
  { label: "Skills", href: "#skills" },
  { label: "Security", href: "#security" },
] as const;

const FOCUS_RING =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function SiteHeader(): ReactElement {
  return (
    <header className="sticky top-0 z-10 border-edge border-b-2 bg-background">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6"
      >
        <a
          className={cn(
            "flex items-center gap-3 rounded-base no-underline",
            FOCUS_RING,
          )}
          href="#top"
        >
          <Logo mark="face" size="sm" />
          <span className="flex flex-col leading-[1.05]">
            <span className="font-heading text-xl tracking-tight">
              AI Toolkit
            </span>
            <span className="font-mono text-muted-foreground text-xs">
              by Noppu Labs
            </span>
          </span>
        </a>
        <div className="flex flex-wrap items-center gap-1">
          <ul className="flex flex-wrap items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-base border-2 border-transparent px-3 py-2 font-base no-underline hover:border-edge hover:bg-secondary-background",
                    FOCUS_RING,
                  )}
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <ThemeToggle className="ml-2 size-11 shadow-shadow-md [&_svg]:size-5" />
          <a
            className={cn(
              buttonVariants({ variant: "noShadow", size: "default" }),
              "ml-2 h-11 border-border bg-ink px-4 font-heading text-base text-white shadow-[3px_3px_0_0_var(--color-main)] hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none [&_svg:first-child]:size-4.5 [&_svg]:size-3.5",
            )}
            href={REPO_URL}
          >
            <GitHubMark />
            GitHub
            <ArrowUpRight aria-hidden="true" strokeWidth={2.5} />
          </a>
        </div>
      </nav>
    </header>
  );
}
