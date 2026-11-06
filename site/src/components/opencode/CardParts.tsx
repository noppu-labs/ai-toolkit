import { ArrowRight } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { CommandLine } from "@/components/CommandText";
import { CopyButton } from "@/components/CopyButton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** A card's frame: an accent header with the mono name and a badge, then the body. */
export function CardFrame({
  name,
  badge,
  accentClass,
  children,
}: {
  name: string;
  badge: string;
  /** A `bg-*` class. */
  accentClass: string;
  children: ReactNode;
}): ReactElement {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border-3 border-edge bg-secondary-background shadow-[5px_5px_0_0_var(--shadow-color)] md:shadow-shadow-lg">
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b-3 border-border px-3.5 py-3 text-black md:gap-3 md:px-5.5 md:py-4.5",
          accentClass,
        )}
      >
        <h3 className="min-w-0 font-mono text-[19px] break-words md:text-[24px]">
          {name}
        </h3>
        <Badge className="shrink-0 bg-white px-2 py-0.5 font-mono text-xs font-bold text-black md:px-2.5 md:py-1 md:text-[13px]">
          {badge}
        </Badge>
      </div>
      {children}
    </article>
  );
}

/** The pill list under a card's text. */
export function CardChips({
  chips,
}: {
  chips: readonly string[];
}): ReactElement {
  return (
    <ul aria-label="Contents" className="flex flex-wrap gap-1.5 md:gap-2">
      {chips.map((chip) => (
        <li
          className="rounded-full border-2 border-edge bg-background px-2.5 py-0.75 text-[13px] font-bold md:px-3 md:py-1.25 md:text-sm"
          key={chip}
        >
          {chip}
        </li>
      ))}
    </ul>
  );
}

/** A card's install command in the dark terminal box, with Copy. */
export function CardCommand({
  command,
  copyLabel,
}: {
  command: string;
  copyLabel: string;
}): ReactElement {
  return (
    <div className="flex items-center gap-2.5 rounded-base border-2 border-border bg-terminal px-3 py-2.5 text-[12.5px] leading-[1.55] text-terminal-foreground md:gap-3 md:px-3.5 md:py-3 md:text-sm md:leading-[1.6]">
      <CommandLine className="min-w-0 flex-1" command={command} />
      <CopyButton
        aria-label={copyLabel}
        className="h-11 shrink-0 border-border bg-white px-2.5 text-[13px] font-heading text-black shadow-none hover:translate-x-0 hover:translate-y-0 focus-visible:ring-offset-terminal md:h-10 md:px-3 [&>svg]:hidden"
        content={command}
        copiedLabel="Copied!"
        label="Copy"
      />
    </div>
  );
}

/** The card's link, styled as in the home page's plugin cards. */
export function CardLink({
  href,
  label,
  children,
}: {
  href: string;
  /** Names the link for assistive tech, when the visible text is shorter. */
  label?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <a
      aria-label={label}
      className="flex min-h-11 items-center justify-between gap-2 rounded-base border-2 border-edge bg-background px-3 py-2 text-[15px] font-heading text-foreground no-underline transition-all hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary-background focus-visible:outline-hidden md:px-3.5 md:shadow-shadow-md"
      href={href}
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-4.5" strokeWidth={2.5} />
    </a>
  );
}
