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
import { OPENCODE_PATH } from "@/lib/opencode";
import { REPO_URL } from "@/lib/repo";
import { cn } from "@/lib/utils";

interface NavLink {
  label: string;
  href: string;
  /** A `section` link points into the home page; a `page` link is a path of its own. */
  kind: "section" | "page";
}

const NAV_LINKS: readonly NavLink[] = [
  { label: "Install", href: "#install", kind: "section" },
  { label: "Plugins", href: "#plugins", kind: "section" },
  { label: "OpenCode", href: OPENCODE_PATH, kind: "page" },
  { label: "Skills", href: "#skills", kind: "section" },
  { label: "Security", href: "#security", kind: "section" },
];

function linkHref(link: NavLink, sectionBase: SectionBase): string {
  return link.kind === "section" ? `${sectionBase}${link.href}` : link.href;
}

/** `"page"` on the OpenCode hub and its plugin pages, for the OpenCode link only. */
function ariaCurrent(link: NavLink, currentPath: string): "page" | undefined {
  const onOpenCode =
    currentPath === OPENCODE_PATH ||
    currentPath.startsWith(`${OPENCODE_PATH}/`);
  return link.href === OPENCODE_PATH && onOpenCode ? "page" : undefined;
}

/** `""` on the home page, whose sections are in the document; `"/"` on the other pages. */
export type SectionBase = "" | "/";

const FOCUS_RING =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const GITHUB_BUTTON = cn(
  buttonVariants({ variant: "noShadow", size: "default" }),
  "border-border bg-ink font-heading text-white shadow-[3px_3px_0_0_var(--color-main)] hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none focus-visible:ring-offset-background",
);

function MobileMenu({
  anchor,
  sectionBase,
  currentPath,
}: {
  anchor: RefObject<HTMLElement | null>;
  sectionBase: SectionBase;
  currentPath: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const linkFollowedRef = useRef(false);

  const handleOpenChange = useCallback((next: boolean): void => {
    linkFollowedRef.current = false;
    setOpen(next);
  }, []);

  const closeAfterLink = useCallback((): void => {
    linkFollowedRef.current = true;
    setOpen(false);
  }, []);

  // Escape, an outside click or the trigger return focus to the trigger; after a
  // link, focus is left alone, so the next Tab starts from the linked section.
  const finalFocus = useCallback(
    (): HTMLElement | false | null =>
      linkFollowedRef.current ? false : triggerRef.current,
    [],
  );

  // The trigger is `md:hidden`, so widening the window hides it; close the menu with it.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!open || trigger === null) {
      return;
    }
    const observer = new ResizeObserver((): void => {
      if (trigger.getClientRects().length === 0) {
        setOpen(false);
      }
    });
    observer.observe(trigger);
    return (): void => observer.disconnect();
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
            finalFocus={finalFocus}
            className="max-h-(--available-height) w-(--anchor-width) overflow-y-auto border-b-3 border-edge bg-secondary-background px-4 pt-2 pb-4.5 text-foreground shadow-[0_6px_0_0_var(--shadow-color)] outline-hidden"
          >
            <nav aria-label="Main">
              <ul>
                {NAV_LINKS.map((link, index) => (
                  <li className="border-b-2 border-edge" key={link.href}>
                    <a
                      className={cn(
                        "flex min-h-15 items-center gap-3.5 rounded-base text-foreground no-underline",
                        FOCUS_RING,
                      )}
                      aria-current={ariaCurrent(link, currentPath)}
                      href={linkHref(link, sectionBase)}
                      onClick={closeAfterLink}
                    >
                      <span
                        aria-hidden="true"
                        className="font-mono text-[13px] font-bold text-muted-foreground"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 text-2xl font-heading tracking-tight">
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
                "mt-4 flex h-13 w-full gap-2.5 text-[17px] [&_svg]:size-4 [&_svg:first-child]:size-5",
              )}
              href={REPO_URL}
              onClick={closeAfterLink}
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

export interface SiteHeaderProps {
  sectionBase?: SectionBase;
  /** The page's path, to mark the nav link of the section it belongs to. */
  currentPath?: string;
}

export function SiteHeader({
  sectionBase = "",
  currentPath = "",
}: SiteHeaderProps): ReactElement {
  const headerRef = useRef<HTMLElement>(null);

  return (
    <header
      className="sticky top-0 z-10 flex min-h-header border-b-2 border-edge bg-background"
      ref={headerRef}
    >
      {/* `flex-wrap`: text-only zoom can outgrow the row without moving the `md` breakpoint; the header then grows rather than clipping. */}
      <div className="mx-auto flex w-full max-w-300 items-center justify-between gap-2 pr-3 pl-4 sm:px-6 md:flex-wrap md:gap-2 md:px-4 md:py-2 lg:gap-3 lg:px-6">
        <a
          className={cn(
            "flex min-h-11 items-center gap-2.5 rounded-base no-underline md:gap-2.5 lg:gap-3",
            FOCUS_RING,
          )}
          href={sectionBase === "" ? "#top" : "/"}
        >
          <Logo
            className="size-10 shadow-shadow-sm md:size-12 md:shadow-shadow-md"
            mark="face"
            size="sm"
          />
          <span className="flex flex-col leading-[1.05]">
            <span className="text-lg font-heading tracking-tight md:text-xl">
              AI Toolkit
            </span>
            <span className="hidden font-mono text-xs text-muted-foreground md:block">
              by Noppu Labs
            </span>
          </span>
        </a>
        <div className="flex items-center gap-2 md:flex-wrap md:gap-1">
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-0.5 md:flex-wrap lg:gap-1">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-base border-2 border-transparent px-1.5 py-2 font-base no-underline hover:border-edge hover:bg-secondary-background lg:px-3",
                      FOCUS_RING,
                    )}
                    aria-current={ariaCurrent(link, currentPath)}
                    href={linkHref(link, sectionBase)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeToggle className="size-11 shadow-shadow-sm md:ml-1 md:shadow-shadow-md lg:ml-2 [&_svg]:size-5" />
          <a
            className={cn(
              GITHUB_BUTTON,
              "ml-2 hidden h-11 px-3 text-base md:inline-flex lg:px-4 [&_svg]:size-3.5 [&_svg:first-child]:size-4.5",
            )}
            href={REPO_URL}
          >
            <GitHubMark />
            GitHub
            <ArrowUpRight aria-hidden="true" strokeWidth={2.5} />
          </a>
          <MobileMenu
            anchor={headerRef}
            currentPath={currentPath}
            sectionBase={sectionBase}
          />
        </div>
      </div>
    </header>
  );
}
