import { Moon, Sun } from "lucide-react";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { useResolvedTheme } from "@/hooks/useResolvedTheme";
import { usePreferencesStore } from "@/stores/usePreferencesStore";

export function ThemeToggle({
  className,
}: {
  className?: string;
}): ReactElement {
  const isDark = useResolvedTheme() === "dark";
  const toggleTheme = usePreferencesStore((state) => state.toggleTheme);

  return (
    <Button
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={className}
      onClick={toggleTheme}
      size="icon"
      variant="neutral"
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
