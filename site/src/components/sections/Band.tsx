import { Fragment, type ReactElement } from "react";

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

/** The rotated ink strip between the hero and the install section. */
export function Band({ skillCount }: BandProps): ReactElement {
  const phrases = [
    "3-stage PR review",
    "deterministic briefs",
    "PHP · TypeScript · Python",
    `${skillCount} skills`,
    "attested releases",
  ];

  return (
    // `overflow-x: clip` stops the wider, rotated strip from causing a
    // horizontal page scroll without clipping it vertically.
    <div aria-hidden="true" className="overflow-x-clip py-3">
      <div className="-mx-5 -rotate-1 overflow-hidden border-border border-y-2 bg-ink">
        <div className="flex justify-center gap-8 whitespace-nowrap py-4.5 font-heading text-[22px] text-white uppercase tracking-[0.04em]">
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
