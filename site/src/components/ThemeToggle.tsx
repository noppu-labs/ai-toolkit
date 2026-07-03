import type { ReactElement } from "react";
import { ThemeTogglerButton } from "@/components/animate-ui/components/buttons/theme-toggler";

export function ThemeToggle(): ReactElement {
  return (
    <ThemeTogglerButton
      aria-label="Toggle theme"
      modes={["light", "dark"]}
      size="sm"
      variant="outline"
    />
  );
}
