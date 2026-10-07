import type { HtmlTagDescriptor, Plugin } from "vite";
import { pluginInstallSteps } from "../src/lib/install-methods.ts";
import { PLUGIN_ORDER } from "../src/lib/plugins.ts";
import { REPO_URL } from "../src/lib/repo.ts";

/**
 * Copies of `src/css/tokens/primitives.css` values, declared on the box itself: in dev the app's
 * stylesheet arrives through JavaScript, so without it the tokens are not defined.
 */
const PALETTE: Readonly<Record<string, string>> = {
  "--palette-black": "oklch(0 0 0)",
  "--palette-white": "oklch(1 0 0)",
  "--palette-ink": "oklch(0.1776 0 0)",
  "--palette-terminal": "oklch(0.1921 0.0176 312.7)",
  "--palette-terminal-text": "oklch(0.9535 0.0101 345.42)",
};

function style(declarations: Readonly<Record<string, string>>): string {
  return Object.entries(declarations)
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Every plugin's Claude Code install commands, the shared marketplace step once. */
export function noscriptInstallCommands(): string[] {
  return [
    ...new Set(
      PLUGIN_ORDER.flatMap((plugin) =>
        pluginInstallSteps(plugin, "claude-code").map((step) => step.command),
      ),
    ),
  ];
}

/** The box visitors without JavaScript see in place of the app. */
export function noscriptInstallHtml(): string {
  const box = style({
    ...PALETTE,
    "max-width": "40rem",
    margin: "2.5rem auto",
    padding: "1.5rem",
    border: "3px solid var(--palette-black)",
    "border-radius": "8px",
    background: "var(--palette-white)",
    "box-shadow": "6px 6px 0 0 var(--palette-black)",
    color: "var(--palette-ink)",
    font: "500 1rem/1.6 'Space Grotesk Variable', system-ui, sans-serif",
  });
  const pre = style({
    margin: "0 0 1rem",
    padding: "1rem",
    "overflow-x": "auto",
    "border-radius": "6px",
    background: "var(--palette-terminal)",
    color: "var(--palette-terminal-text)",
    font: "0.875rem/1.7 'JetBrains Mono Variable', ui-monospace, monospace",
  });
  const commands = noscriptInstallCommands().map(escapeHtml).join("\n");
  return `<div style="${box}">
<h1 style="margin: 0 0 0.75rem; font-size: 1.75rem; line-height: 1.15">AI Toolkit</h1>
<p style="margin: 0 0 1rem">Agent skills for deep code review and grounded investigation. The skills catalog needs JavaScript, but you can install the plugins in Claude Code without it:</p>
<pre style="${pre}">${commands}</pre>
<p style="margin: 0">Every plugin and skill is described in the <a href="${REPO_URL}#readme" style="color: inherit; font-weight: 700; text-decoration: underline">README on GitHub</a>.</p>
</div>`;
}

/** Adds the noscript box to `index.html` in dev and build, so a new plugin needs no edit there. */
export function noscriptInstall(): Plugin {
  return {
    name: "noscript-install",
    transformIndexHtml(): HtmlTagDescriptor[] {
      return [
        { tag: "noscript", children: noscriptInstallHtml(), injectTo: "body" },
      ];
    },
  };
}
