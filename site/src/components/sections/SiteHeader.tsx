import { Popover } from "@base-ui/react/popover";
import { ArrowUpRight, ChevronRight, Menu, X } from "lucide-react";
import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { GitHubMark } from "@/components/GitHubMark";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buttonVariants } from "@/components/ui/button-variants";
import { REPO_URL } from "@/lib/repo";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Install", href: "#install" },
  { label: "Plugins", href: "#plugins" },
  { label: "Skills", href: "#skills" },
  { label: "Security", href: "#security" },
] as const;

/** Tailwind's `md`: from here the header shows its links inline instead of the menu. */
const INLINE_NAV_QUERY = "(width >= 48rem)";

const FOCUS_RING =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const GITHUB_BUTTON = cn(
  buttonVariants({ variant: "noShadow", size: "default" }),
  "border-border bg-ink font-heading text-white shadow-[3px_3px_0_0_var(--color-main)] hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none focus-visible:ring-offset-background",
);

function MobileMenu({
  anchor,
}: {
  anchor: RefObject<HTMLElement | null>;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleOpenChange = useCallback((next: boolean): void => {
    setOpen(next);
  }, []);

  // Following a link closes the menu; the browser then scrolls to the section.
  const close = useCallback((): void => {
    setOpen(false);
  }, []);

  // Widening the window past the breakpoint hides the trigger; close the menu with it.
  useEffect(() => {
    if (!open) {
      return;
    }
    const query = window.matchMedia(INLINE_NAV_QUERY);
    const onChange = (): void => {
      if (query.matches) {
        setOpen(false);
      }
    };
    query.addEventListener("change", onChange);
    return (): void => query.removeEventListener("change", onChange);
  }, [open]);

  return (
    <Popover.Root onOpenChange={handleOpenChange} open={open}>
      <Popover.Trigger
        aria-label={open ? "Close menu" : "Open menu"}
        ref={triggerRef}
        className={cn(
          buttonVariants({ variant: "noShadow", size: "icon-lg" }),
          "bg-white text-black shadow-shadow-sm focus-visible:ring-offset-background data-popup-open:bg-main md:hidden [&_svg]:size-5",
        )}
      >
        {open ? (
          <X aria-hidden="true" strokeWidth={2.5} />
        ) : (
          <Menu aria-hidden="true" strokeWidth={2.5} />
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Backdrop className="fixed inset-x-0 top-header bottom-0 bg-black/45" />
        <Popover.Positioner
          anchor={anchor}
          collisionAvoidance={{ side: "none", align: "none" }}
          collisionPadding={0}
          positionMethod="fixed"
          side="bottom"
        >
          <Popover.Popup
            aria-label="Menu"
            // Back to the menu button however the menu closes, even after a link moved focus to its section.
            finalFocus={triggerRef}
            className="max-h-(--available-height) w-(--anchor-width) overflow-y-auto border-edge border-b-3 bg-secondary-background px-4 pt-2 pb-4.5 text-foreground shadow-[0_6px_0_0_var(--shadow-color)] outline-hidden"
          >
            <nav aria-label="Main">
              <ul>
                {NAV_LINKS.map((link, index) => (
                  <li className="border-edge border-b-2" key={link.href}>
                    <a
                      className={cn(
                        "flex min-h-15 items-center gap-3.5 rounded-base text-foreground no-underline",
                        FOCUS_RING,
                      )}
                      href={link.href}
                      onClick={close}
                    >
                      <span
                        aria-hidden="true"
                        className="font-bold font-mono text-[13px] text-muted-foreground"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 font-heading text-2xl tracking-tight">
                        {link.label}
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-5"
                        strokeWidth={2.5}
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <a
              className={cn(
                GITHUB_BUTTON,
                "mt-4 flex h-13 w-full gap-2.5 text-[17px] [&_svg:first-child]:size-5 [&_svg]:size-4",
              )}
              href={REPO_URL}
              onClick={close}
            >
              <GitHubMark />
              View on GitHub
              <ArrowUpRight aria-hidden="true" strokeWidth={2.5} />
            </a>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function SiteHeader(): ReactElement {
  const headerRef = useRef<HTMLElement>(null);

  return (
    <header
      className="sticky top-0 z-10 h-header border-edge border-b-2 bg-background"
      ref={headerRef}
    >
      <div className="mx-auto flex h-full max-w-300 items-center justify-between gap-2 pr-3 pl-4 sm:px-6 md:gap-3">
        <a
          className={cn(
            "flex min-h-11 items-center gap-2.5 rounded-base no-underline md:gap-3",
            FOCUS_RING,
          )}
          href="#top"
        >
          <Logo
            className="size-10 shadow-shadow-sm md:size-12 md:shadow-shadow-md"
            mark="face"
            size="sm"
          />
          <span className="flex flex-col leading-[1.05]">
            <span className="font-heading text-lg tracking-tight md:text-xl">
              AI Toolkit
            </span>
            <span className="hidden font-mono text-muted-foreground text-xs md:block">
              by Noppu Labs
            </span>
          </span>
        </a>
        <div className="flex items-center gap-2 md:gap-1">
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
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
          </nav>
          <ThemeToggle className="size-11 shadow-shadow-sm md:ml-2 md:shadow-shadow-md [&_svg]:size-5" />
          <a
            className={cn(
              GITHUB_BUTTON,
              "ml-2 hidden h-11 px-4 text-base md:inline-flex [&_svg:first-child]:size-4.5 [&_svg]:size-3.5",
            )}
            href={REPO_URL}
          >
            <GitHubMark />
            GitHub
            <ArrowUpRight aria-hidden="true" strokeWidth={2.5} />
          </a>
          <MobileMenu anchor={headerRef} />
        </div>
      </div>
    </header>
  );
}
