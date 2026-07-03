import type { ReactElement } from "react";
import { StarsBackground } from "@/components/animate-ui/components/backgrounds/stars";
import { CopyButton } from "@/components/animate-ui/components/buttons/copy";
import { GradientText } from "@/components/animate-ui/primitives/texts/gradient";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CLAUDE_CODE_COMMANDS = [
  "/plugin marketplace add noppu-labs/ai-toolkit",
  "/plugin install laravel@ai-toolkit",
  "/plugin install inertia-react@ai-toolkit",
].join("\n");

const SKILLS_CLI_COMMANDS = [
  "npx skills add noppu-labs/ai-toolkit/laravel",
  "npx skills add noppu-labs/ai-toolkit/inertia-react",
].join("\n");

const HERO_GRADIENT =
  "linear-gradient(90deg, var(--hero-gradient-from) 0%, var(--hero-gradient-to) 50%, var(--hero-gradient-from) 100%)";

const BADGES = [
  {
    alt: "tests status",
    src: "https://github.com/noppu-labs/ai-toolkit/actions/workflows/validate.yml/badge.svg",
  },
  {
    alt: "build status",
    src: "https://github.com/noppu-labs/ai-toolkit/actions/workflows/release.yml/badge.svg",
  },
  {
    alt: "OpenSSF Scorecard",
    src: "https://api.scorecard.dev/projects/github.com/noppu-labs/ai-toolkit/badge",
  },
  {
    alt: "Releases attested",
    src: "https://img.shields.io/badge/releases-attested-blue?logo=github",
  },
  {
    alt: "Known vulnerabilities (Snyk)",
    src: "https://snyk.io/test/github/noppu-labs/ai-toolkit/badge.svg",
  },
];

interface InstallBlockProps {
  title: string;
  commands: string;
  copyLabel: string;
}

function InstallBlock({
  title,
  commands,
  copyLabel,
}: InstallBlockProps): ReactElement {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-muted-foreground text-sm">{title}</CardTitle>
        <CopyButton
          aria-label={`Copy ${copyLabel}`}
          content={commands}
          size="sm"
          variant="ghost"
        />
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto font-mono text-sm">
          <code>{commands}</code>
        </pre>
      </CardContent>
    </Card>
  );
}

interface HeroProps {
  description: string;
}

export function Hero({ description }: HeroProps): ReactElement {
  return (
    <StarsBackground
      className="relative overflow-hidden bg-none"
      starColor="var(--color-muted-foreground)"
    >
      <header className="relative mx-auto max-w-5xl px-6 pt-10 pb-16">
        <div className="flex items-center justify-between">
          <p className="font-mono text-muted-foreground text-sm">
            noppu-labs/ai-toolkit
          </p>
          <ThemeToggle />
        </div>
        <h1 className="mt-12 font-semibold text-5xl tracking-tight">
          <GradientText gradient={HERO_GRADIENT} text="AI Toolkit" />
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {BADGES.map((badge) => (
            <img
              alt={badge.alt}
              className="h-5"
              key={badge.src}
              src={badge.src}
            />
          ))}
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <InstallBlock
            commands={CLAUDE_CODE_COMMANDS}
            copyLabel="Claude Code install commands"
            title="Claude Code marketplace"
          />
          <InstallBlock
            commands={SKILLS_CLI_COMMANDS}
            copyLabel="skills CLI commands"
            title="Vercel skills CLI"
          />
        </div>
      </header>
    </StarsBackground>
  );
}
