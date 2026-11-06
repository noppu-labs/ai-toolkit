import { ArrowRight } from "lucide-react";
import { type ReactElement, useId } from "react";
import { OpenCodeCards } from "@/components/opencode/OpenCodeCards";
import { OPENCODE_PATH } from "@/lib/opencode";
import type { OpenCodeCard } from "@/lib/opencode-cards";

/** The home page's third section: the standalone OpenCode plugins, linked to the hub. */
export function OpenCodeSection({
  cards,
}: {
  cards: readonly OpenCodeCard[];
}): ReactElement {
  const headingId = useId();

  return (
    // biome-ignore lint/correctness/useUniqueElementIds: the in-page anchor the nav may link to; the section renders once.
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-300 scroll-mt-header px-4 pt-6 pb-12 sm:px-6 md:pt-8 md:pb-24"
      id="opencode"
    >
      <p className="font-mono text-xs font-bold tracking-[0.08em] uppercase md:text-sm">
        03 — OpenCode
      </p>
      <h2
        className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] md:mt-3 md:text-5xl md:leading-none"
        id={headingId}
      >
        Plugins for OpenCode.
      </h2>
      <p className="mt-3 max-w-180 text-base leading-normal text-muted-foreground md:mt-5 md:text-lg md:leading-[1.55]">
        <code className="font-mono font-bold">
          opencode-permission-reviewer
        </code>{" "}
        answers permission prompts so routine work doesn't wait on you.{" "}
        <code className="font-mono font-bold">opencode-cache-manager</code>{" "}
        keeps the prompt cache warm while you're away. Each installs with one
        command.
      </p>
      <OpenCodeCards cards={cards} />
      <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-[10px] border-2 border-edge bg-secondary-background px-4 py-4 shadow-shadow-md md:mt-8 md:flex-row md:items-center md:gap-6 md:px-5 md:shadow-shadow">
        <p className="text-base leading-normal">
          <code className="font-mono font-bold">review</code> and{" "}
          <code className="font-mono font-bold">investigate</code> install on
          OpenCode too.
        </p>
        <a
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-base border-2 border-border bg-main px-3.5 py-2 text-[15px] font-heading text-main-foreground no-underline shadow-shadow-md transition-all hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden"
          href={OPENCODE_PATH}
        >
          All OpenCode plugins
          <ArrowRight
            aria-hidden="true"
            className="size-4.5"
            strokeWidth={2.5}
          />
        </a>
      </div>
    </section>
  );
}
