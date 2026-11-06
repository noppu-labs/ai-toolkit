import { ArrowRight } from "lucide-react";
import { type ReactElement, type ReactNode, useId } from "react";

/** A block of the hub: an eyebrow, an `h2`, an optional lede and the cards. */
export function HubSection({
  eyebrow,
  heading,
  lede,
  children,
}: {
  eyebrow: string;
  heading: string;
  lede?: string;
  children: ReactNode;
}): ReactElement {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-300 px-4 pt-6 pb-10 sm:px-6 md:pt-8 md:pb-16"
    >
      <p className="font-mono text-xs font-bold tracking-[0.08em] uppercase md:text-sm">
        {eyebrow}
      </p>
      <h2
        className="mt-2 text-[32px] leading-[1.05] tracking-[-0.03em] text-balance md:mt-3 md:text-[44px]"
        id={headingId}
      >
        {heading}
      </h2>
      {lede === undefined ? null : (
        <p className="mt-3 max-w-150 text-base leading-normal text-muted-foreground md:mt-4 md:text-lg">
          {lede}
        </p>
      )}
      {children}
    </section>
  );
}

/** Sends visitors on Claude Code or another agent to the home page's install section. */
export function InstallBand({ href }: { href: string }): ReactElement {
  return (
    <div className="mx-auto max-w-300 px-4 pb-14 sm:px-6 md:pb-22">
      <div className="flex flex-col items-start justify-between gap-3 rounded-[10px] border-3 border-edge bg-secondary-background px-4 py-4 shadow-shadow-md md:flex-row md:items-center md:gap-6 md:px-6 md:py-5 md:shadow-shadow">
        <p className="text-base leading-normal md:text-lg">
          On Claude Code or another agent? The skills install through the Claude
          Code marketplace or the skills CLI.
        </p>
        <a
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-base border-2 border-border bg-main px-3.5 py-2 text-[15px] font-heading text-main-foreground no-underline shadow-shadow-md transition-all hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden"
          href={href}
        >
          Install the skills
          <ArrowRight
            aria-hidden="true"
            className="size-4.5"
            strokeWidth={2.5}
          />
        </a>
      </div>
    </div>
  );
}
