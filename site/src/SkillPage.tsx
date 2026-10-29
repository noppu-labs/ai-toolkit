import { ChevronRight } from "lucide-react";
import { type ReactElement, useId } from "react";
import { SkillDetailBody } from "./components/catalog/SkillDetail.tsx";
import { PageFrame } from "./components/PageFrame.tsx";
import type { CatalogSkill } from "./lib/catalog.ts";
import { pluginColorClass } from "./lib/plugins.ts";
import { skillPath } from "./lib/site.ts";
import { pluginSkillsHref } from "./lib/url-state.ts";
import { cn } from "./lib/utils.ts";

const CRUMB_LINK =
  "rounded-sm text-foreground underline underline-offset-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

interface SkillPageProps {
  skill: CatalogSkill;
  /** The plugin's other skills, in catalog order. */
  siblings: readonly CatalogSkill[];
}

function Breadcrumb({ skill }: { skill: CatalogSkill }): ReactElement {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold font-mono text-[13px] md:text-sm">
        <li>
          <a className={CRUMB_LINK} href="/#skills">
            Skills
          </a>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <a className={CRUMB_LINK} href={`/${pluginSkillsHref(skill.plugin)}`}>
            {skill.plugin}
          </a>
        </li>
        <li aria-hidden="true">/</li>
        <li className="min-w-0 break-words">
          <span aria-current="page">{skill.name}</span>
        </li>
      </ol>
    </nav>
  );
}

function MoreSkills({
  plugin,
  skills,
}: {
  plugin: string;
  skills: readonly CatalogSkill[];
}): ReactElement {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="mt-10 md:mt-14">
      <h2
        className="text-[26px] leading-[1.05] tracking-[-0.03em] md:text-[32px]"
        id={headingId}
      >
        More {plugin} skills
      </h2>
      <ul className="mt-4 overflow-hidden rounded-[10px] border-2 border-edge bg-background shadow-shadow-md md:mt-5 md:shadow-shadow">
        {skills.map((skill) => (
          <li className="border-edge not-last:border-b-2" key={skill.name}>
            <a
              className="group/row flex min-h-16 w-full items-center gap-2.5 px-3 py-2.5 text-foreground no-underline outline-hidden hover:bg-secondary-background focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset md:gap-3.5 md:px-4 md:py-3"
              href={skillPath(skill.name)}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.75 md:gap-1">
                <span className="break-words font-bold font-mono text-sm underline-offset-3 group-hover/row:underline group-hover/row:decoration-2 md:text-[15px]">
                  {skill.name}
                </span>
                <span className="text-muted-foreground text-sm leading-[1.35] md:text-[15px] md:leading-[1.4]">
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
    </section>
  );
}

/** A skill's own page: what the catalog's pane shows, at a URL search engines can index. */
export function SkillPage({ skill, siblings }: SkillPageProps): ReactElement {
  const titleId = useId();

  return (
    <PageFrame sectionBase="/">
      <div className="mx-auto max-w-200 px-4 pt-8 pb-14 sm:px-6 md:pt-14 md:pb-22">
        <Breadcrumb skill={skill} />
        <article
          aria-labelledby={titleId}
          className="mt-4 overflow-hidden rounded-[12px] border-3 border-edge bg-background shadow-shadow-xl md:mt-5"
        >
          <div
            className={cn(
              "flex items-center border-border border-b-3 px-4.5 py-3.5 text-black",
              pluginColorClass(skill.plugin),
            )}
          >
            <span className="font-bold font-mono text-sm">{skill.plugin}</span>
          </div>
          <div className="px-5 pt-5 pb-5.5 md:px-7 md:pt-7 md:pb-7">
            <h1
              className="break-words font-mono text-[28px] leading-[1.15] md:text-[36px]"
              id={titleId}
            >
              {skill.name}
            </h1>
            <SkillDetailBody skill={skill} surface="pane" />
          </div>
        </article>
        {siblings.length > 0 ? (
          <MoreSkills plugin={skill.plugin} skills={siblings} />
        ) : null}
      </div>
    </PageFrame>
  );
}
