import type { ReactElement } from "react";
import { useId } from "react";
import { CopyButton } from "@/components/animate-ui/components/buttons/copy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const VERIFY_COMMAND =
  "gh attestation verify <plugin>-<version>.tgz --repo noppu-labs/ai-toolkit";

const LINKS = [
  {
    label: "Security policy",
    href: "https://github.com/noppu-labs/ai-toolkit/blob/main/SECURITY.md",
  },
  {
    label: "OpenSSF Scorecard",
    href: "https://scorecard.dev/viewer/?uri=github.com/noppu-labs/ai-toolkit",
  },
  {
    label: "Release attestations",
    href: "https://github.com/noppu-labs/ai-toolkit/attestations",
  },
];

export function SecuritySection(): ReactElement {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-5xl px-6 pb-16"
    >
      <h2 className="font-semibold text-2xl tracking-tight" id={headingId}>
        Security &amp; provenance
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Every release ships a plugin tarball with GitHub build provenance
        attestation, proving it was built by this repository&apos;s CI from the
        tagged commit.
      </p>
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-muted-foreground text-sm">
            Verify a release
          </CardTitle>
          <CopyButton
            aria-label="Copy verify command"
            content={VERIFY_COMMAND}
            size="sm"
            variant="ghost"
          />
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto font-mono text-sm">
            <code>{VERIFY_COMMAND}</code>
          </pre>
        </CardContent>
      </Card>
      <ul className="mt-6 flex flex-wrap gap-4">
        {LINKS.map((link) => (
          <li key={link.href}>
            <a
              className="text-primary text-sm hover:underline"
              href={link.href}
              rel="noreferrer"
              target="_blank"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
