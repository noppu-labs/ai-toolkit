import { Fragment, type ReactElement } from "react";
import { pluralize } from "@/lib/pluralize";

interface BandProps {
  skillCount: number;
}

const SPARK_COLORS = [
  "text-main",
  "text-plugin-review",
  "text-plugin-investigate",
  "text-plugin-inertia-react",
  "text-main",
] as const;

export function Band({ skillCount }: BandProps): ReactElement {
  const phrases = [
    "3-stage PR review",
    "deterministic briefs",
    "PHP · TypeScript · Python",
    pluralize(skillCount, "skill"),
    "attested releases",
  ];

  return (
    // `overflow-x: clip` stops the wider, rotated strip from causing a
    // horizontal page scroll without clipping it vertically.
    <div aria-hidden="true" className="overflow-x-clip py-3">
      <div className="-mx-5 -rotate-1 overflow-hidden border-y-2 border-border bg-ink">
        <div className="flex justify-center gap-8 py-4.5 text-[22px] font-heading tracking-[0.04em] whitespace-nowrap text-white uppercase">
          {phrases.map((phrase, index) => (
            <Fragment key={phrase}>
              <span>{phrase}</span>
              <span className={SPARK_COLORS[index]}>✦</span>
            </Fragment>
          ))}
          <span>{phrases[0]}</span>
        </div>
      </div>
    </div>
  );
}
