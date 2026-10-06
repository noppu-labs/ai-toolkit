import { ArrowUpRight } from "lucide-react";
import type { ReactElement } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/noppu-labs/ai-toolkit";

const NAV_LINKS = [
  { label: "Plugins", href: "#plugins" },
  { label: "Skills", href: "#skills" },
  { label: "Security", href: "#security" },
] as const;

const FOCUS_RING =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** The sticky top bar: brand, section links, theme toggle and GitHub. */
export function SiteHeader(): ReactElement {
  return (
    <header className="sticky top-0 z-10 border-border border-b-2 bg-background">
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
          <Logo size="sm" />
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
                    "inline-flex min-h-11 items-center rounded-base border-2 border-transparent px-3 py-2 font-base no-underline hover:border-border hover:bg-secondary-background",
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
              buttonVariants({ size: "default" }),
              "ml-2 h-11 border-border bg-ink px-4 font-heading text-base text-white shadow-[3px_3px_0_0_var(--color-main)] hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
            )}
            href={REPO_URL}
          >
            GitHub
            <ArrowUpRight aria-hidden="true" strokeWidth={2.5} />
          </a>
        </div>
      </nav>
    </header>
  );
}
