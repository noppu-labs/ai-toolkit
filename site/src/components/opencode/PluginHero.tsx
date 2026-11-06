import { type ReactElement, type ReactNode, useId } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { OPENCODE_PATH } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import { InlineText } from "./InlineText.tsx";

const CRUMB_LINK =
  "rounded-sm text-foreground underline underline-offset-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const CHIP =
  "inline-flex items-center gap-2 rounded-full border-2 border-edge bg-secondary-background px-2.5 py-1 font-mono text-xs font-bold md:px-3 md:text-[13px] md:shadow-shadow-sm";

// Full-width and stacked on phones; side by side from `sm`.
const CTA_CLASSES =
  "h-12 w-full px-5.5 font-heading text-base focus-visible:ring-offset-background sm:h-13 sm:w-auto sm:text-[17px]";

interface PluginHeroProps {
  name: string;
  title: string;
  tagline: string;
  version: string;
  license: string;
  repoUrl: string;
  packageUrl: string;
  image: { src: string; width: number; height: number; alt: string };
  /** The plugin's accent, a `bg-*` class. */
  accentClass: string;
  /** The install box, an island. */
  children: ReactNode;
}

function Breadcrumb({ name }: { name: string }): ReactElement {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[13px] font-bold md:text-sm">
        <li>
          <a className={CRUMB_LINK} href={OPENCODE_PATH}>
            OpenCode
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

/** The top of a plugin's page: breadcrumb, chips, title, tagline, install box, links and the plugin's image. */
export function PluginHero({
  name,
  title,
  tagline,
  version,
  license,
  repoUrl,
  packageUrl,
  image,
  accentClass,
  children,
}: PluginHeroProps): ReactElement {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto max-w-300 px-4 pt-5 pb-10 sm:px-6 md:pt-7 md:pb-16"
    >
      <Breadcrumb name={name} />
      <div className="mt-5 flex flex-wrap items-center gap-9 md:mt-12 md:gap-12">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col items-start">
          <ul className="flex flex-wrap gap-2">
            <li className={CHIP}>
              <span
                aria-hidden="true"
                className={cn(
                  "size-2.5 shrink-0 rounded-full border-2 border-border",
                  accentClass,
                )}
              />
              OpenCode plugin
            </li>
            <li className={CHIP}>v{version}</li>
            <li className={CHIP}>{license}</li>
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
              className={cn(
                buttonVariants({ variant: "default" }),
                CTA_CLASSES,
              )}
              href={repoUrl}
              rel="noreferrer"
              target="_blank"
            >
              GitHub <span aria-hidden="true">↗</span>
            </a>
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
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_420px] justify-center pr-2.5 md:pr-3.5">
          <div className="relative w-full max-w-130">
            <div
              aria-hidden="true"
              className={cn(
                "absolute inset-0 translate-x-2.5 translate-y-2.5 rounded-[14px] border-3 border-border md:translate-x-3.5 md:translate-y-3.5",
                accentClass,
              )}
            />
            <img
              alt={image.alt}
              className="relative block h-auto w-full -rotate-[1.5deg] rounded-[14px] border-3 border-border shadow-shadow-md"
              decoding="async"
              height={image.height}
              src={image.src}
              width={image.width}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
