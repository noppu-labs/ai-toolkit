import { type ReactElement, type ReactNode, useId } from "react";
import { SkillRows } from "./components/SkillRows.tsx";
import type { CatalogSkill } from "./lib/catalog.ts";
import { pluginColorClass } from "./lib/plugins.ts";
import { pluginSkillsHref } from "./lib/url-state.ts";
import { cn } from "./lib/utils.ts";

const CRUMB_LINK =
  "rounded-sm text-foreground underline underline-offset-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

interface SkillPageProps {
  skill: CatalogSkill;
  /** The plugin's other skills, in catalog order. */
  siblings: readonly CatalogSkill[];
  /** What follows the skill's name inside the article: the page's `SkillDetailBody` island. */
  children: ReactNode;
  /** The skill's rendered SKILL.md, shown below the article. */
  body?: ReactNode;
}

function Breadcrumb({ skill }: { skill: CatalogSkill }): ReactElement {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[13px] font-bold md:text-sm">
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
      <SkillRows skills={skills} />
    </section>
  );
}

function SkillBody({
  name,
  body,
}: {
  name: string;
  body: ReactNode;
}): ReactElement {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="mt-10 md:mt-14">
      <h2
        className="text-[26px] leading-[1.05] tracking-[-0.03em] md:text-[32px]"
        id={headingId}
      >
        How {name} works
      </h2>
      <p className="mt-2 text-muted-foreground">
        The skill's full SKILL.md: the instructions your agent follows.
      </p>
      <div className="prose-pre:overflow-x-auto prose-headings:scroll-mt-header prose-headings:font-heading prose-headings:tracking-[-0.02em] prose-code:before:content-none prose-code:after:content-none prose-code:font-mono prose-code:text-[0.9em] prose-pre:rounded-[10px] prose-pre:border-2 prose-pre:border-edge prose-pre:shadow-shadow mt-4 max-w-none break-words prose md:mt-5">
        {body}
      </div>
    </section>
  );
}

/** A skill's own page, inside the layout's frame: what the catalog's pane shows, at a URL search engines can index. */
export function SkillPage({
  skill,
  siblings,
  children,
  body,
}: SkillPageProps): ReactElement {
  const titleId = useId();

  return (
    <div className="mx-auto max-w-200 px-4 pt-8 pb-14 sm:px-6 md:pt-14 md:pb-22">
      <Breadcrumb skill={skill} />
      <article
        aria-labelledby={titleId}
        className="mt-4 overflow-hidden rounded-[12px] border-3 border-edge bg-background shadow-shadow-xl md:mt-5"
      >
        <div
          className={cn(
            "flex items-center border-b-3 border-border px-4.5 py-3.5 text-black",
            pluginColorClass(skill.plugin),
          )}
        >
          <span className="font-mono text-sm font-bold">{skill.plugin}</span>
        </div>
        <div className="px-5 pt-5 pb-5.5 md:px-7 md:pt-7 md:pb-7">
          <h1
            className="font-mono text-[28px] leading-[1.15] break-words md:text-[36px]"
            id={titleId}
          >
            {skill.name}
          </h1>
          {children}
        </div>
      </article>
      {body === undefined ? null : <SkillBody body={body} name={skill.name} />}
      {siblings.length > 0 ? (
        <MoreSkills plugin={skill.plugin} skills={siblings} />
      ) : null}
    </div>
  );
}
