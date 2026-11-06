import type { ReactElement } from "react";
import type { OpenCodeCard } from "@/lib/opencode-cards";
import { cn } from "@/lib/utils";
import { CardChips, CardCommand, CardFrame, CardLink } from "./CardParts.tsx";
import { InlineText } from "./InlineText.tsx";

function PluginCard({ card }: { card: OpenCodeCard }): ReactElement {
  const { image } = card;
  return (
    <CardFrame
      accentClass={card.accentClass}
      badge={`v${card.version}`}
      name={card.name}
    >
      {image === undefined ? null : (
        <img
          alt={image.alt}
          className="block h-auto w-full border-b-3 border-border"
          decoding="async"
          height={image.height}
          loading="lazy"
          src={image.src}
          width={image.width}
        />
      )}
      <div className="flex flex-1 flex-col gap-3 p-3.5 md:gap-4.5 md:p-5.5">
        <p
          className={cn(
            "text-[15px] leading-normal md:text-[17px] [&_code]:font-bold",
          )}
        >
          <InlineText text={card.summary} />
        </p>
        <CardChips chips={card.chips} />
        <CardCommand
          command={card.command}
          copyLabel={`Copy the install command for ${card.name}`}
        />
        <CardLink href={card.href} label={`About ${card.name}`}>
          About {card.name}
        </CardLink>
      </div>
    </CardFrame>
  );
}

/** The hub's cards for the synced OpenCode plugins: header, image, summary, chips, install command and a link to the plugin's page. */
export function OpenCodeCards({
  cards,
}: {
  cards: readonly OpenCodeCard[];
}): ReactElement {
  return (
    <div className="mt-6 grid gap-6 md:mt-8 md:grid-cols-2 md:gap-8">
      {cards.map((card) => (
        <PluginCard card={card} key={card.name} />
      ))}
    </div>
  );
}
