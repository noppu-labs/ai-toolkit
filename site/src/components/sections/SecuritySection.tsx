import type { ReactElement } from "react";
import { useId } from "react";
import { CommandLine } from "@/components/CommandText";
import { CopyButton } from "@/components/CopyButton";
import { REPO_SLUG, REPO_URL } from "@/lib/repo";

const VERIFY_COMMAND = `gh attestation verify <plugin>-<version>.tgz --repo ${REPO_SLUG}`;

const LINKS = [
  { label: "Security policy", href: `${REPO_URL}/blob/main/SECURITY.md` },
  {
    label: "OpenSSF Scorecard",
    href: `https://scorecard.dev/viewer/?uri=github.com/${REPO_SLUG}`,
  },
  { label: "Release attestations", href: `${REPO_URL}/attestations` },
];

const HEALTH_LINKS = [
  { label: "tests", href: `${REPO_URL}/actions/workflows/tests.yml` },
  { label: "fuzz", href: `${REPO_URL}/actions/workflows/fuzz.yml` },
  { label: "build", href: `${REPO_URL}/actions/workflows/release.yml` },
  {
    label: "OpenSSF Best Practices",
    href: "https://www.bestpractices.dev/projects/13473",
  },
  {
    label: "OpenSSF Baseline",
    href: "https://www.bestpractices.dev/projects/13473/baseline-1",
  },
  { label: "Snyk", href: `https://snyk.io/test/github/${REPO_SLUG}` },
];

// The panel is lime and the card header white in both themes, so text and
// focus rings stay black rather than following the theme tokens.
const FOCUS_ON_LIGHT =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2";

export function SecuritySection(): ReactElement {
  const headingId = useId();

  return (
    // biome-ignore lint/correctness/useUniqueElementIds: the in-page anchor the nav links to; the section renders once.
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-300 scroll-mt-header px-4 pt-12 pb-14 sm:px-6 md:py-28"
      id="security"
    >
      <div className="flex flex-col rounded-[14px] border-3 border-border bg-plugin-investigate px-4.5 py-5.5 text-black shadow-shadow-lg md:flex-row md:flex-wrap md:items-center md:gap-10 md:rounded-2xl md:p-[clamp(28px,5vw,56px)] md:shadow-[10px_10px_0px_0px_var(--shadow-color)]">
        {/* On phones both columns dissolve into one, so the command follows the paragraph it explains. */}
        <div className="contents md:block md:min-w-0 md:flex-[1_1_380px]">
          <p className="font-bold font-mono text-xs uppercase tracking-[0.08em] md:text-sm">
            04 — Security &amp; provenance
          </p>
          <h2
            className="mt-2 text-[28px] leading-[1.05] tracking-[-0.03em] md:mt-3 md:text-[44px] md:leading-[1.02]"
            id={headingId}
          >
            Every release is attested.
          </h2>
          <p className="mt-3 text-[15px] leading-normal md:mt-5 md:text-lg md:leading-[1.55]">
            Each release ships a plugin tarball with GitHub build provenance
            attestation, proving it was built by this repository&rsquo;s CI from
            the tagged commit.
          </p>
          <ul className="order-1 mt-4 flex flex-col gap-2.5 md:order-none md:mt-6 md:flex-row md:flex-wrap">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  className={`flex min-h-12 items-center justify-between gap-2 rounded-base border-2 border-border bg-white px-3.5 py-2.5 font-bold text-black shadow-shadow-md transition-all hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none md:inline-flex md:min-h-11 ${FOCUS_ON_LIGHT}`}
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
        </div>
        <div className="contents md:flex md:min-w-0 md:flex-[999_1_460px] md:flex-col md:gap-4">
          <div className="mt-4 overflow-hidden rounded-[8px] border-2 border-border bg-terminal md:mt-0 md:rounded-[10px] md:border-3 md:shadow-shadow-lg">
            <div className="flex items-center justify-between gap-3 border-border border-b-2 bg-white py-1.5 pr-1.5 pl-3 md:border-b-3 md:pl-3.5">
              <span className="font-bold text-sm">Verify a release</span>
              <CopyButton
                aria-label="Copy verify command"
                className={`border-border bg-white text-black shadow-shadow-sm ${FOCUS_ON_LIGHT}`}
                content={VERIFY_COMMAND}
                size="icon-lg"
              />
            </div>
            <div className="px-3 py-2.5 text-[12.5px] text-terminal-foreground leading-[1.6] md:px-5 md:py-4.5 md:text-[15px] md:leading-[1.7]">
              <CommandLine
                command={VERIFY_COMMAND}
                markerClassName="text-plugin-investigate"
              />
            </div>
          </div>
          <ul
            aria-label="Project health"
            className="order-2 mt-4 flex flex-wrap gap-1.5 md:order-none md:mt-0 md:gap-2"
          >
            {HEALTH_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  className={`inline-flex min-h-11 items-center rounded-full border-2 border-border bg-white px-3.5 font-bold font-mono text-[13px] text-black underline-offset-2 hover:underline ${FOCUS_ON_LIGHT}`}
                  href={link.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
