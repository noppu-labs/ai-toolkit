"use client";

import type { VariantProps } from "class-variance-authority";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { buttonVariants } from "@/components/animate-ui/components/buttons/button-variants";
import {
  type Resolved,
  type ThemeSelection,
  ThemeToggler as ThemeTogglerPrimitive,
  type ThemeTogglerProps as ThemeTogglerPrimitiveProps,
} from "@/components/animate-ui/primitives/effects/theme-toggler";
import { cn } from "@/lib/utils";

const getIcon = (
  effective: ThemeSelection,
  resolved: Resolved,
  modes: ThemeSelection[],
): React.JSX.Element => {
  const theme = modes.includes("system") ? effective : resolved;
  return theme === "system" ? (
    <Monitor />
  ) : theme === "dark" ? (
    <Moon />
  ) : (
    <Sun />
  );
};

const getNextTheme = (
  effective: ThemeSelection,
  modes: ThemeSelection[],
): ThemeSelection => {
  const i = modes.indexOf(effective);
  if (i === -1) return modes[0] ?? "system";
  return modes[(i + 1) % modes.length] ?? "system";
};

export type ThemeTogglerButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    modes?: ThemeSelection[];
    onImmediateChange?: ThemeTogglerPrimitiveProps["onImmediateChange"];
    direction?: ThemeTogglerPrimitiveProps["direction"];
  };

type ThemeTogglerButtonContentProps = Omit<
  ThemeTogglerButtonProps,
  "modes" | "onImmediateChange" | "direction"
> & {
  effective: ThemeSelection;
  resolved: Resolved;
  toggleTheme: (theme: ThemeSelection) => void;
  modes: ThemeSelection[];
};

function ThemeTogglerButtonContent({
  effective,
  resolved,
  toggleTheme,
  modes,
  variant,
  size,
  onClick,
  className,
  ...props
}: ThemeTogglerButtonContentProps): React.JSX.Element {
  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      onClick?.(e);
      toggleTheme(getNextTheme(effective, modes));
    },
    [onClick, toggleTheme, effective, modes],
  );

  return (
    <button
      data-slot="theme-toggler-button"
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={handleClick}
      {...props}
    >
      {getIcon(effective, resolved, modes)}
    </button>
  );
}

function ThemeTogglerButton({
  variant = "default",
  size = "default",
  modes = ["light", "dark", "system"],
  direction = "ltr",
  onImmediateChange,
  onClick,
  className,
  ...props
}: ThemeTogglerButtonProps): React.JSX.Element {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <ThemeTogglerPrimitive
      theme={theme as ThemeSelection}
      resolvedTheme={resolvedTheme as Resolved}
      setTheme={setTheme}
      direction={direction}
      onImmediateChange={onImmediateChange}
    >
      {({
        effective,
        resolved,
        toggleTheme,
      }: {
        effective: ThemeSelection;
        resolved: Resolved;
        toggleTheme: (theme: ThemeSelection) => void;
      }): React.JSX.Element => (
        <ThemeTogglerButtonContent
          effective={effective}
          resolved={resolved}
          toggleTheme={toggleTheme}
          modes={modes}
          variant={variant}
          size={size}
          onClick={onClick}
          className={className}
          {...props}
        />
      )}
    </ThemeTogglerPrimitive>
  );
}

export { ThemeTogglerButton };
