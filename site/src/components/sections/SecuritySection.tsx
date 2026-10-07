import type { ReactElement } from "react";
import { useId } from "react";
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
      className="mx-auto max-w-300 scroll-mt-24 px-4 py-28 sm:px-6"
      id="security"
    >
      <div className="flex flex-wrap items-center gap-10 rounded-2xl border-3 border-border bg-plugin-investigate p-[clamp(28px,5vw,56px)] text-black shadow-[10px_10px_0px_0px_var(--shadow-color)]">
        <div className="min-w-0 flex-[1_1_380px]">
          <p className="font-bold font-mono text-sm uppercase tracking-[0.08em]">
            04 — Security &amp; provenance
          </p>
          <h2
            className="mt-3 text-4xl leading-[1.02] tracking-[-0.03em] sm:text-[44px]"
            id={headingId}
          >
            Every release is attested.
          </h2>
          <p className="mt-5 text-lg leading-[1.55]">
            Each release ships a plugin tarball with GitHub build provenance
            attestation, proving it was built by this repository&rsquo;s CI from
            the tagged commit.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2.5">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  className={`inline-flex min-h-11 items-center rounded-base border-2 border-border bg-white px-3.5 py-2.5 font-bold text-black shadow-shadow-md transition-all hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none ${FOCUS_ON_LIGHT}`}
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
        <div className="flex min-w-0 flex-[999_1_460px] flex-col gap-4">
          <div className="overflow-hidden rounded-[10px] border-3 border-border bg-terminal shadow-shadow-lg">
            <div className="flex items-center justify-between gap-3 border-border border-b-3 bg-white py-1.5 pr-1.5 pl-3.5">
              <span className="font-bold text-sm">Verify a release</span>
              <CopyButton
                aria-label="Copy verify command"
                className={`border-border bg-white text-black shadow-shadow-sm ${FOCUS_ON_LIGHT}`}
                content={VERIFY_COMMAND}
                size="icon-lg"
              />
            </div>
            <pre className="wrap-anywhere whitespace-pre-wrap p-5 font-mono text-[15px] text-terminal-foreground">
              <code>
                <span
                  aria-hidden="true"
                  className="mr-2.5 text-plugin-investigate"
                >
                  ›
                </span>
                {VERIFY_COMMAND}
              </code>
            </pre>
          </div>
          <ul aria-label="Project health" className="flex flex-wrap gap-2">
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
