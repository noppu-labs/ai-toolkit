import { ArrowDown } from "lucide-react";
import { type ReactElement, useId } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { LOGO_SRC } from "@/lib/assets";
import { pluralize } from "@/lib/pluralize";
import { REPO_SLUG } from "@/lib/repo";
import { cn } from "@/lib/utils";

// Full-width and stacked on phones, so both fit the first screen; side by side from `sm`.
const CTA_CLASSES =
  "h-13 w-full px-6 font-heading text-[17px] focus-visible:ring-offset-background sm:h-14 sm:w-auto sm:text-lg";

interface HeroProps {
  description: string;
  skillCount: number;
  pluginCount: number;
}

export function Hero({
  description,
  skillCount,
  pluginCount,
}: HeroProps): ReactElement {
  const headingId = useId();

  return (
    // biome-ignore lint/correctness/useUniqueElementIds: the in-page anchor the header brand links to; the hero renders once.
    <section
      aria-labelledby={headingId}
      className="mx-auto flex max-w-300 scroll-mt-header flex-wrap items-center gap-9 px-4 pt-6 pb-10 sm:px-6 md:gap-14 md:pt-18 md:pb-22"
      id="top"
    >
      <div className="min-w-0 flex-[999_1_520px]">
        <span className="inline-flex items-center gap-2 rounded-full border-2 border-edge bg-secondary-background px-2.5 py-1 font-bold font-mono text-xs md:px-3 md:py-1.5 md:text-[13px] md:shadow-shadow-sm">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full border-2 border-border bg-plugin-investigate md:size-2.5"
          />
          Claude Code marketplace
          <span className="hidden sm:inline">· {REPO_SLUG}</span>
        </span>
        <h1
          className="mt-4.5 text-[40px] leading-[1.02] tracking-[-0.04em] md:mt-7 md:text-[clamp(44px,6vw,80px)] md:leading-[0.98]"
          id={headingId}
        >
          Agent skills for{" "}
          <span className="my-1 inline-block -rotate-[1.5deg] rounded-base border-3 border-border bg-main px-2 text-main-foreground shadow-[3px_3px_0_0_var(--color-border)] md:my-1.5 md:rounded-[8px] md:px-3 md:shadow-[5px_5px_0_0_var(--color-border)]">
            deep code review
          </span>{" "}
          and grounded investigation.
        </h1>
        <p className="mt-4 max-w-150 text-base text-muted-foreground leading-normal md:mt-7 md:text-xl">
          {description}
        </p>
        <div className="mt-5.5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4 md:mt-9">
          <a
            className={cn(buttonVariants({ variant: "default" }), CTA_CLASSES)}
            href="#install"
          >
            Install the plugins
            <ArrowDown aria-hidden="true" strokeWidth={2.5} />
          </a>
          <a
            className={cn(buttonVariants({ variant: "neutral" }), CTA_CLASSES)}
            href="#skills"
          >
            Browse {pluralize(skillCount, "skill")}
          </a>
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_380px] justify-center px-2 md:px-0">
        <div className="relative w-full max-w-110">
          <div
            aria-hidden="true"
            className="absolute inset-0 translate-x-2.5 translate-y-2.5 rotate-[2.5deg] rounded-[14px] border-3 border-border bg-plugin-inertia-react md:translate-x-3.5 md:translate-y-3.5 md:rotate-3 md:rounded-2xl"
          />
          <figure className="relative m-0 -rotate-2 overflow-hidden rounded-[14px] border-3 border-border bg-main p-4 text-main-foreground shadow-shadow-lg md:rounded-2xl md:p-6 md:shadow-shadow-xl">
            <img
              alt="The AI Toolkit mascot: a pink axolotl"
              className="block h-42.5 w-full object-contain md:aspect-[1/0.72] md:h-auto md:object-cover"
              decoding="async"
              height={302}
              src={LOGO_SRC}
              width={420}
            />
            <figcaption className="mt-1.5 flex items-center justify-between gap-2 font-bold font-mono text-xs md:mt-2 md:text-sm">
              <span>{REPO_SLUG}</span>
              <span className="rounded-base border-2 border-border bg-white px-2 py-0.75 md:px-2.5 md:py-1">
                {pluralize(pluginCount, "plugin")}
              </span>
            </figcaption>
          </figure>
          <div
            aria-hidden="true"
            className="absolute -top-5.5 -right-1.5 flex size-19 rotate-12 flex-col items-center justify-center rounded-full border-3 border-border bg-plugin-review font-heading text-main-foreground leading-none shadow-shadow-md md:-top-6.5 md:-right-4.5 md:size-26 md:shadow-shadow"
          >
            <span className="text-[26px] md:text-[34px]">{skillCount}</span>
            <span className="text-[11px] uppercase tracking-[0.06em] md:text-[13px]">
              skills
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
