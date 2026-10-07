import { ArrowDown } from "lucide-react";
import { type ReactElement, useId } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { LOGO_SRC } from "@/lib/assets";
import { pluralize } from "@/lib/pluralize";
import { REPO_SLUG } from "@/lib/repo";
import { cn } from "@/lib/utils";

const CTA_CLASSES =
  "h-14 px-6 font-heading text-lg focus-visible:ring-offset-background";

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
      className="mx-auto flex max-w-300 scroll-mt-24 flex-wrap items-center gap-14 px-4 pt-18 pb-22 sm:px-6"
      id="top"
    >
      <div className="min-w-0 flex-[999_1_520px]">
        <span className="inline-flex items-center gap-2 rounded-full border-2 border-edge bg-secondary-background px-3 py-1.5 font-bold font-mono text-[13px] shadow-shadow-sm">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full border-2 border-border bg-plugin-investigate"
          />
          Claude Code marketplace · {REPO_SLUG}
        </span>
        <h1
          className="mt-7 text-[clamp(44px,6vw,80px)] leading-[0.98] tracking-[-0.04em]"
          id={headingId}
        >
          Agent skills for{" "}
          <span className="my-1.5 inline-block -rotate-[1.5deg] rounded-[8px] border-3 border-border bg-main px-3 text-main-foreground shadow-[5px_5px_0_0_var(--color-border)]">
            deep code review
          </span>{" "}
          and grounded investigation.
        </h1>
        <p className="mt-7 max-w-150 text-muted-foreground text-xl leading-normal">
          {description}
        </p>
        <div className="mt-9 flex flex-wrap gap-4">
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

      <div className="flex min-w-0 flex-[1_1_380px] justify-center">
        <div className="relative w-full max-w-110">
          <div
            aria-hidden="true"
            className="absolute inset-0 translate-x-3.5 translate-y-3.5 rotate-3 rounded-2xl border-3 border-border bg-plugin-inertia-react"
          />
          <figure className="relative m-0 -rotate-2 overflow-hidden rounded-2xl border-3 border-border bg-main p-6 text-main-foreground shadow-shadow-xl">
            <img
              alt="The AI Toolkit mascot: a pink axolotl"
              className="block aspect-[1/0.72] w-full object-cover"
              decoding="async"
              height={302}
              src={LOGO_SRC}
              width={420}
            />
            <figcaption className="mt-2 flex items-center justify-between gap-2 font-bold font-mono text-sm">
              <span>{REPO_SLUG}</span>
              <span className="rounded-base border-2 border-border bg-white px-2.5 py-1">
                {pluralize(pluginCount, "plugin")}
              </span>
            </figcaption>
          </figure>
          <div
            aria-hidden="true"
            className="absolute -top-6.5 -right-2 flex size-26 rotate-12 flex-col items-center justify-center rounded-full border-3 border-border bg-plugin-review font-heading text-main-foreground leading-none shadow-shadow sm:-right-4.5"
          >
            <span className="text-[34px]">{skillCount}</span>
            <span className="text-[13px] uppercase tracking-[0.06em]">
              skills
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
