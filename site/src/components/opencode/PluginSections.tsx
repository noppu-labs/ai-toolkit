import { type ReactElement, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";
import { InlineText } from "./InlineText.tsx";

// Code in manifest text reads as a term, as in the mockups.
const BODY_CODE = "[&_code]:font-bold";

function PluginSection({
  eyebrow,
  heading,
  children,
}: {
  eyebrow: string;
  heading: ReactNode;
  children: ReactNode;
}): ReactElement {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-300 px-4 pt-6 pb-10 sm:px-6 md:pt-8 md:pb-16"
    >
      <p className="font-mono text-xs font-bold tracking-[0.08em] uppercase md:text-sm">
        {eyebrow}
      </p>
      <h2
        className="mt-2 text-[32px] leading-[1.05] tracking-[-0.03em] text-balance md:mt-3 md:text-[44px]"
        id={headingId}
      >
        {heading}
      </h2>
      {children}
    </section>
  );
}

interface Highlight {
  label: string;
  title: string;
  body: string;
}

export function Highlights({
  heading,
  items,
  accentClass,
}: {
  heading: string;
  items: readonly Highlight[];
  /** The plugin's accent, a `bg-*` class, for each card's label. */
  accentClass: string;
}): ReactElement {
  return (
    <PluginSection
      eyebrow="01 — What it does"
      heading={<InlineText text={heading} />}
    >
      <ul className="mt-6 grid gap-4 md:mt-8 md:grid-cols-2 md:gap-5.5 lg:grid-cols-3">
        {items.map((item) => (
          <li
            className="flex flex-col items-start gap-2 rounded-[10px] border-2 border-edge bg-secondary-background px-4 py-4 shadow-shadow-md md:px-5 md:py-4.5 md:shadow-shadow"
            key={item.title}
          >
            <span
              className={cn(
                "rounded-full border-2 border-border px-2 py-px font-mono text-xs font-bold text-black",
                accentClass,
              )}
            >
              {item.label}
            </span>
            <h3 className="text-lg leading-snug tracking-[-0.01em] md:text-[19px]">
              <InlineText text={item.title} />
            </h3>
            <p
              className={cn(
                "text-[15px] leading-normal text-muted-foreground md:text-[15.5px]",
                BODY_CODE,
              )}
            >
              <InlineText text={item.body} />
            </p>
          </li>
        ))}
      </ul>
    </PluginSection>
  );
}

interface Figure {
  src: ImageMetadata;
  alt: string;
  caption?: string | undefined;
}

export function HowItWorks({
  heading,
  steps,
  figure,
}: {
  heading: string;
  steps: readonly string[];
  figure?: Figure | undefined;
}): ReactElement {
  return (
    <PluginSection
      eyebrow="02 — How it works"
      heading={<InlineText text={heading} />}
    >
      <div
        className={cn(
          "mt-6 grid items-start gap-7 md:mt-8 md:gap-9",
          figure !== undefined &&
            "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]",
        )}
      >
        <ol className="flex max-w-170 flex-col gap-3.5">
          {steps.map((step, index) => (
            <li
              className={cn(
                "grid grid-cols-[34px_1fr] items-start gap-3 text-base leading-normal md:text-[16.5px]",
                BODY_CODE,
              )}
              key={step}
            >
              <span
                aria-hidden="true"
                className="flex size-7.5 items-center justify-center rounded-full border-2 border-edge bg-secondary-background font-mono text-sm font-bold"
              >
                {index + 1}
              </span>
              <span className="pt-0.5">
                <InlineText text={step} />
              </span>
            </li>
          ))}
        </ol>
        {figure === undefined ? null : (
          <figure className="m-0 flex min-w-0 flex-col gap-2.5 rounded-xl border-3 border-edge bg-black p-3 shadow-shadow-lg md:p-3.5">
            <img
              alt={figure.alt}
              className="block h-auto w-full"
              decoding="async"
              height={figure.src.height}
              loading="lazy"
              src={figure.src.src}
              width={figure.src.width}
            />
            {figure.caption === undefined ? null : (
              <figcaption className="text-[13px] leading-normal text-white/75 md:text-[13.5px]">
                <InlineText text={figure.caption} />
              </figcaption>
            )}
          </figure>
        )}
      </div>
    </PluginSection>
  );
}

interface Config {
  path: string;
  code: string;
}

interface DocLink {
  label: string;
  href: string;
}

function DocLinks({ links }: { links: readonly DocLink[] }): ReactElement {
  return (
    <ul
      aria-label="Documentation"
      className="mt-6 flex flex-wrap gap-2.5 md:mt-8"
    >
      {links.map((link) => (
        <li key={link.href}>
          <a
            className="inline-flex min-h-11 items-center gap-1.5 rounded-base border-2 border-edge bg-secondary-background px-3.5 py-2 text-sm font-bold text-foreground no-underline shadow-shadow-sm transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden"
            href={link.href}
            rel="noreferrer"
            target="_blank"
          >
            {link.label}
            <span aria-hidden="true">↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Requirements({
  items,
  config,
  links,
}: {
  items: readonly string[];
  config?: Config | undefined;
  links?: readonly DocLink[] | undefined;
}): ReactElement {
  return (
    <PluginSection eyebrow="03 — Requirements" heading="What you need.">
      <div className="mt-6 grid items-start gap-6 md:mt-8 md:grid-cols-2 md:gap-7">
        <ul
          className={cn(
            "flex list-disc flex-col gap-2 pl-5 text-base leading-normal md:text-[16.5px]",
            BODY_CODE,
          )}
        >
          {items.map((item) => (
            <li key={item}>
              <InlineText text={item} />
            </li>
          ))}
        </ul>
        {config === undefined ? null : (
          <figure className="m-0 min-w-0 overflow-hidden rounded-[8px] border-2 border-edge bg-terminal text-terminal-foreground shadow-shadow-md">
            <figcaption className="border-b-2 border-terminal-foreground/20 px-3.5 py-2 font-mono text-xs font-bold break-all text-terminal-foreground/75 md:px-4">
              {config.path}
            </figcaption>
            <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[13px] leading-[1.6] md:px-4 md:py-3.5 md:text-sm">
              <code>{config.code}</code>
            </pre>
          </figure>
        )}
      </div>
      {links === undefined || links.length === 0 ? null : (
        <DocLinks links={links} />
      )}
    </PluginSection>
  );
}

interface Question {
  q: string;
  a: string;
}

export function Questions({
  faq,
}: {
  faq?: readonly Question[] | undefined;
}): ReactElement | null {
  if (faq === undefined || faq.length === 0) {
    return null;
  }
  return (
    <PluginSection eyebrow="04 — Questions" heading="Before you install.">
      <div className="mt-6 flex flex-col gap-3 md:mt-8">
        {faq.map((item) => (
          <div
            className="rounded-[10px] border-2 border-edge bg-secondary-background px-4 py-3.5 md:px-4.5"
            key={item.q}
          >
            <h3 className="text-[17px] leading-snug md:text-lg">
              <InlineText text={item.q} />
            </h3>
            <p
              className={cn(
                "mt-1.5 text-[15px] leading-normal text-muted-foreground md:text-base",
                BODY_CODE,
              )}
            >
              <InlineText text={item.a} />
            </p>
          </div>
        ))}
      </div>
    </PluginSection>
  );
}
