import { ChevronRight } from "lucide-react";
import type { ReactElement } from "react";
import type { CatalogSkill } from "@/lib/catalog";
import { skillPath } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SkillRows({
  skills,
  className,
}: {
  skills: readonly CatalogSkill[];
  className?: string | undefined;
}): ReactElement {
  return (
    <ul
      className={cn(
        "overflow-hidden rounded-[10px] border-2 border-edge bg-background shadow-shadow-md md:shadow-shadow",
        className,
      )}
    >
      {skills.map((skill) => (
        <li className="border-edge not-last:border-b-2" key={skill.name}>
          <a
            className="group/row flex min-h-16 w-full items-center gap-2.5 px-3 py-2.5 text-foreground no-underline outline-hidden hover:bg-secondary-background focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset md:gap-3.5 md:px-4 md:py-3"
            href={skillPath(skill.name)}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.75 md:gap-1">
              <span className="font-mono text-sm font-bold break-words underline-offset-3 group-hover/row:underline group-hover/row:decoration-2 md:text-[15px]">
                {skill.name}
              </span>
              <span className="text-sm leading-[1.35] text-muted-foreground md:text-[15px] md:leading-[1.4]">
                {skill.summary}
              </span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className="size-4.5 shrink-0"
              strokeWidth={2.5}
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
