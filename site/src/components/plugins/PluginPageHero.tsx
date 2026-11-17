import { type ReactElement, type ReactNode, useId } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { CHIP, CRUMB_LINK, CTA_CLASSES } from "../opencode/hero-classes.ts";
import { InlineText } from "../opencode/InlineText.tsx";

interface PluginPageHeroProps {
  name: string;
  title: string;
  tagline: string;
  version: string;
  /** Chips after the plugin and version chips. */
  chips: readonly string[];
  /** The plugin's accent, a `bg-*` class. */
  accentClass: string;
  sourceUrl: string;
  /** The plugin's npm page; the link is left out when the plugin has none. */
  packageUrl?: string | undefined;
  /** The install box, an island. */
  children: ReactNode;
}

function Breadcrumb({ name }: { name: string }): ReactElement {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[13px] font-bold md:text-sm">
        <li>
          <a className={CRUMB_LINK} href="/#plugins">
            Plugins
          </a>
        </li>
        <li aria-hidden="true">/</li>
        <li className="min-w-0 break-words">
          <span aria-current="page">{name}</span>
        </li>
      </ol>
    </nav>
  );
}

/** The top of a toolkit plugin's page: breadcrumb, chips, title, tagline, install box and links. */
export function PluginPageHero({
  name,
  title,
  tagline,
  version,
  chips,
  accentClass,
  sourceUrl,
  packageUrl,
  children,
}: PluginPageHeroProps): ReactElement {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto max-w-300 px-4 pt-5 pb-10 sm:px-6 md:pt-7 md:pb-16"
    >
      <Breadcrumb name={name} />
      <div className="mt-5 flex flex-col items-start md:mt-12">
        <ul className="flex flex-wrap gap-2">
          <li className={CHIP}>
            <span
              aria-hidden="true"
              className={cn(
                "size-2.5 shrink-0 rounded-full border-2 border-border",
                accentClass,
              )}
            />
            AI Toolkit plugin
          </li>
          <li className={CHIP}>v{version}</li>
          {chips.map((chip) => (
            <li className={CHIP} key={chip}>
              {chip}
            </li>
          ))}
        </ul>
        <h1
          className="mt-4.5 text-[40px] leading-[1.02] tracking-[-0.04em] text-balance md:mt-6 md:text-[clamp(44px,5.5vw,68px)]"
          id={titleId}
        >
          {title}
        </h1>
        <p className="mt-4 max-w-150 text-base leading-normal text-muted-foreground md:mt-5 md:text-lg md:leading-[1.55]">
          <InlineText text={tagline} />
        </p>
        <div className="mt-5 w-full md:mt-7">{children}</div>
        <div className="mt-5 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-3.5 md:mt-7">
          <a
            className={cn(buttonVariants({ variant: "default" }), CTA_CLASSES)}
            href={sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            GitHub <span aria-hidden="true">↗</span>
          </a>
          {packageUrl === undefined ? null : (
            <a
              className={cn(
                buttonVariants({ variant: "neutral" }),
                CTA_CLASSES,
              )}
              href={packageUrl}
              rel="noreferrer"
              target="_blank"
            >
              npm <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
