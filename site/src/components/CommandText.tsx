import { Fragment, type ReactElement, type ReactNode } from "react";
import { REPO_SLUG } from "@/lib/repo";
import { cn } from "@/lib/utils";

const SLUG_PREFIX = `${REPO_SLUG}/`;

// Browsers also break after hyphens (`noppu-labs`, `inertia-react`), so each
// word is kept whole. The one extra break is after the repo slug in a plugin
// path, where `noppu-labs/ai-toolkit/inertia-react` would not fit a phone line.
function word(text: string): ReactNode {
  if (!text.startsWith(SLUG_PREFIX) || text === SLUG_PREFIX) {
    return <span className="whitespace-nowrap">{text}</span>;
  }
  return (
    <>
      <span className="whitespace-nowrap">{SLUG_PREFIX}</span>
      <wbr />
      <span className="whitespace-nowrap">
        {text.slice(SLUG_PREFIX.length)}
      </span>
    </>
  );
}

export function CommandWords({ command }: { command: string }): ReactElement {
  const words = command.split(" ");
  return (
    <>
      {words.map((text, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a command's words never reorder, and may repeat.
        <Fragment key={index}>
          {index > 0 ? " " : null}
          {word(text)}
        </Fragment>
      ))}
    </>
  );
}

interface CommandLineProps {
  command: string;
  /** The prompt glyph by default, or a step number. */
  marker?: ReactNode;
  className?: string;
  markerClassName?: string;
}

/** One terminal line; a wrapped command continues under its first word, not under the marker. */
export function CommandLine({
  command,
  marker = "›",
  className,
  markerClassName,
}: CommandLineProps): ReactElement {
  return (
    <div className={cn("pl-[2ch] -indent-[2ch] font-mono", className)}>
      <span
        aria-hidden="true"
        className={cn("mr-[1ch] text-main", markerClassName)}
      >
        {marker}
      </span>
      <code>
        <CommandWords command={command} />
      </code>
    </div>
  );
}
