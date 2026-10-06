import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { type ReactElement, useCallback } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle({
  className,
}: {
  className?: string;
}): ReactElement {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const toggle = useCallback(
    (): void => setTheme(isDark ? "light" : "dark"),
    [isDark, setTheme],
  );

  return (
    <Button
      aria-label="Toggle theme"
      className={className}
      onClick={toggle}
      size="icon"
      variant="neutral"
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
