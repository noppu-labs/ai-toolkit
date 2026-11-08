import { type ReactElement, type ReactNode, useId } from "react";
import { REPO_URL } from "@/lib/repo";

const LINK =
  "rounded-sm font-bold underline underline-offset-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden";

interface StoredItem {
  name: string;
  kind: string;
  kept: string;
  purpose: string;
}

const STORED_ITEMS: StoredItem[] = [
  {
    name: "_ga",
    kind: "Cookie, only while analytics is on",
    kept: "Up to 2 years",
    purpose: "Google Analytics: tells one visitor from another.",
  },
  {
    name: "_ga_MHP3L2JTTP",
    kind: "Cookie, only while analytics is on",
    kept: "Up to 2 years",
    purpose: "Google Analytics: keeps track of the current visit.",
  },
  {
    name: "noppu_analytics_consent",
    kind: "Cookie, set when you answer the banner",
    kept: "Up to 6 months",
    purpose:
      "Remembers whether you allowed analytics, declined it, or acknowledged the notice, here and on noppu.com.",
  },
  {
    name: "ai-toolkit-preferences",
    kind: "Browser storage",
    kept: "Until you clear it",
    purpose:
      "Your theme and install method. It stays in your browser and is never sent to us.",
  },
];

function Section({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-2xl tracking-[-0.02em] md:text-[28px]">{heading}</h2>
      {children}
    </section>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}): ReactElement {
  return (
    <a className={LINK} href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  );
}

/** The privacy page's copy. `children` is the page's Cookie settings button, an island. */
export function PrivacyPolicy({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const headingId = useId();

  return (
    <article
      aria-labelledby={headingId}
      className="mx-auto flex max-w-300 flex-col gap-8 px-4 pt-6 pb-16 sm:px-6 md:gap-10 md:pt-18 md:pb-24"
    >
      <header className="flex flex-col gap-4 md:gap-6">
        <h1
          className="text-[40px] leading-[1.02] tracking-[-0.04em] md:text-[clamp(44px,6vw,80px)] md:leading-[0.98]"
          id={headingId}
        >
          <span className="inline-block -rotate-[1.5deg] rounded-base border-3 border-border bg-main px-2 text-main-foreground shadow-[3px_3px_0_0_var(--color-border)] md:rounded-[8px] md:px-3 md:shadow-[5px_5px_0_0_var(--color-border)]">
            Privacy
          </span>
        </h1>
        <p className="max-w-170 text-base leading-normal text-muted-foreground md:text-xl">
          This site counts visits with Google Analytics. In the EEA, the UK and
          Switzerland it asks you first; elsewhere it runs unless you opt out.
          While it's off, nothing about your visit goes to Google.
        </p>
        <p className="font-mono text-[13px] font-bold">
          Last updated 8 November 2026
        </p>
      </header>

      <div className="flex max-w-170 flex-col gap-8 leading-relaxed md:gap-10">
        <Section heading="Who runs this site">
          <p>
            AI Toolkit is an open source project by Noppu Labs. Noppu Labs
            decides what is measured here and why.
          </p>
        </Section>

        <Section heading="Where we ask first">
          <p>
            Cloudflare, our host, tells the site which country your visit comes
            from. If that's in the European Economic Area, the UK or
            Switzerland, or Cloudflare can't tell, analytics stays off until you
            allow it. Anywhere else it starts when the page loads, and the
            banner lets you opt out. We don't keep your country ourselves. It
            can appear in Cloudflare's request logs, which we use to fix
            problems with the site and which are deleted after at most a week.
            Your browser keeps the answer for up to an hour so it isn't looked
            up on every page.
          </p>
          <p>
            If your browser sends a{" "}
            <ExternalLink href="https://globalprivacycontrol.org/">
              Global Privacy Control
            </ExternalLink>{" "}
            signal, we ask first wherever you are. Clicking "Got it" on the
            notice only records that you saw it. It does not count as allowing
            analytics, so where we ask first you are asked again.
          </p>
        </Section>

        <Section heading="While analytics is on">
          <p>
            Google Analytics records the pages you view, the site you came from,
            your device and browser type, your approximate location, and actions
            such as scrolling or following a link out. We use this to see which
            pages people read. Where we ask first, the legal basis is your
            consent. We run no ads.
          </p>
          <p>
            Google handles this data as{" "}
            <ExternalLink href="https://support.google.com/analytics/answer/6004245">
              our processor
            </ExternalLink>
            , and may transfer it outside your country. Google{" "}
            <ExternalLink href="https://support.google.com/analytics/answer/12017362">
              says it does not log or store IP addresses
            </ExternalLink>{" "}
            from the EU, Switzerland or the UK. Elsewhere it{" "}
            <ExternalLink href="https://support.google.com/analytics/answer/16871531">
              uses them for coarse location and spam detection
            </ExternalLink>
            , then discards them. Google keeps event and user-level data for up
            to about 14 months, and aggregated figures, such as visits per page,
            can stay in reports for longer.
          </p>
          <p>
            Read{" "}
            <ExternalLink href="https://policies.google.com/technologies/partner-sites">
              How Google uses information from sites or apps that use our
              services
            </ExternalLink>
            .
          </p>
        </Section>

        <Section heading="While it's off">
          <p>
            Google's script never loads. We store your answer so that we don't
            ask again for up to 6 months.
          </p>
        </Section>
      </div>

      <Section heading="What's stored in your browser">
        <div className="overflow-x-auto rounded-base border-2 border-edge bg-secondary-background shadow-shadow">
          <table className="w-full min-w-160 border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-edge font-heading">
                <th className="p-3" scope="col">
                  Name
                </th>
                <th className="p-3" scope="col">
                  Type
                </th>
                <th className="p-3" scope="col">
                  Kept for
                </th>
                <th className="p-3" scope="col">
                  Purpose
                </th>
              </tr>
            </thead>
            <tbody>
              {STORED_ITEMS.map((item) => (
                <tr
                  className="border-b border-edge last:border-b-0"
                  key={item.name}
                >
                  <th className="p-3 font-mono font-bold" scope="row">
                    {item.name}
                  </th>
                  <td className="p-3">{item.kind}</td>
                  <td className="p-3 whitespace-nowrap">{item.kept}</td>
                  <td className="p-3">{item.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="flex max-w-170 flex-col gap-8 leading-relaxed md:gap-10">
        <Section heading="Hosting">
          <p>
            Cloudflare hosts this site. Like any host, it handles each request,
            including your IP address, to deliver the page and protect the site.
            Fonts are served from this site, not from Google. Links to GitHub,
            npm and others lead to sites with their own policies.
          </p>
        </Section>

        <Section heading="noppu.com">
          <p>
            These cookies are set on noppu.com, so they apply to this site and
            to noppu.com alike. noppu.com uses the same Google Analytics
            property and honours the same answer, so visits to both can be
            linked as one visitor's.
          </p>
        </Section>

        <Section heading="Your choices">
          <p>
            You can change your answer at any time. Turning analytics off stops
            new measurement straight away and deletes Google's cookies from your
            browser. Anything already queued may still go out within seconds,
            and other open tabs of this site stop when you return to them.
          </p>
          <div>{children}</div>
          <p>
            Depending on where you live, you can ask to see or delete data about
            you, object to its use, or complain to your data protection
            authority. To ask us anything,{" "}
            <ExternalLink href={`${REPO_URL}/issues/new`}>
              open an issue
            </ExternalLink>{" "}
            without personal details, and we'll arrange a private way to talk.
          </p>
        </Section>

        <Section heading="Changes">
          <p>
            If this page changes, the date at the top changes with it. If we
            start measuring something new, we'll ask you again.
          </p>
        </Section>
      </div>
    </article>
  );
}
