import { type ReactElement, useId } from "react";

/** The top of the OpenCode hub: a chip, the title with "OpenCode" highlighted, and the lede. */
export function HubHero(): ReactElement {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-300 px-4 pt-6 pb-6 sm:px-6 md:pt-18 md:pb-8"
    >
      <span className="inline-flex items-center gap-2 rounded-full border-2 border-edge bg-secondary-background px-2.5 py-1 font-mono text-xs font-bold md:px-3 md:py-1.5 md:text-[13px] md:shadow-shadow-sm">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full border-2 border-border bg-plugin-opencode-permission-reviewer md:size-2.5"
        />
        OpenCode plugins · noppu-labs
      </span>
      <h1
        className="mt-4.5 text-[40px] leading-[1.02] tracking-[-0.04em] md:mt-7 md:text-[clamp(44px,6vw,80px)] md:leading-[0.98]"
        id={headingId}
      >
        Plugins for{" "}
        <span className="my-1 inline-block -rotate-[1.5deg] rounded-base border-3 border-border bg-main px-2 text-main-foreground shadow-[3px_3px_0_0_var(--color-border)] md:my-1.5 md:rounded-[8px] md:px-3 md:shadow-[5px_5px_0_0_var(--color-border)]">
          OpenCode
        </span>
        .
      </h1>
      <p className="mt-4 max-w-170 text-base leading-normal text-muted-foreground md:mt-7 md:text-xl">
        Four plugins from Noppu Labs. Two stand on their own: a reviewer that
        answers permission prompts, and a prompt-cache manager for Claude and
        GPT. The other two bring the toolkit's review and investigate skills to
        OpenCode. Each one installs with{" "}
        <code className="font-bold text-foreground">opencode plugin add</code>.
      </p>
    </section>
  );
}
