import type { ReactElement } from "react";
import type { ToolkitOpenCodeCard } from "@/lib/opencode-cards";
import { isLanguageAgnostic } from "@/lib/plugins";
import { pluralize } from "@/lib/pluralize";
import { CardChips, CardCommand, CardFrame, CardLink } from "./CardParts.tsx";

function chipsOf(card: ToolkitOpenCodeCard): string[] {
  const chips = [pluralize(card.skillCount, "skill")];
  if (isLanguageAgnostic(card.name)) {
    chips.push("any language");
  }
  return chips;
}

function ToolkitCard({ card }: { card: ToolkitOpenCodeCard }): ReactElement {
  return (
    <CardFrame
      accentClass={card.accentClass}
      badge="OpenCode V2"
      name={card.name}
    >
      <div className="flex flex-1 flex-col gap-3 p-3.5 md:gap-4.5 md:p-5.5">
        <p className="text-[15px] leading-normal md:text-[17px]">
          {card.description}
        </p>
        <CardChips chips={chipsOf(card)} />
        <CardCommand
          command={card.command}
          copyLabel={`Copy the install command for the ${card.name} OpenCode package`}
        />
        <CardLink href={card.skillsHref}>
          See {pluralize(card.skillCount, `${card.name} skill`)}
        </CardLink>
      </div>
    </CardFrame>
  );
}

/** The hub's cards for the toolkit's plugins that ship an OpenCode package. */
export function ToolkitOpenCodeCards({
  cards,
}: {
  cards: readonly ToolkitOpenCodeCard[];
}): ReactElement {
  return (
    <div className="mt-6 grid gap-6 md:mt-8 md:grid-cols-2 md:gap-8">
      {cards.map((card) => (
        <ToolkitCard card={card} key={card.name} />
      ))}
    </div>
  );
}
