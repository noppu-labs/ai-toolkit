import type { ReactElement } from "react";
import { splitInlineCode } from "@/lib/inline-code.ts";

/** Text from a manifest, with backtick pairs shown as code. Never HTML. */
export function InlineText({ text }: { text: string }): ReactElement {
  return (
    <>
      {splitInlineCode(text).map((run, index) =>
        run.code ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs are static and have no id
          <code key={index} className="font-mono text-[0.9em]">
            {run.text}
          </code>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs are static and have no id
          <span key={index}>{run.text}</span>
        ),
      )}
    </>
  );
}
