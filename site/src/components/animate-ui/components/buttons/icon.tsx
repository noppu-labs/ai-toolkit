"use client";

import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { buttonVariants } from "@/components/animate-ui/components/buttons/button-variants";
import {
  Button as ButtonPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
} from "@/components/animate-ui/primitives/buttons/button";
import {
  Particles,
  ParticlesEffect,
} from "@/components/animate-ui/primitives/effects/particles";
import { cn } from "@/lib/utils";

export type IconButtonProps = Omit<ButtonPrimitiveProps, "asChild"> &
  VariantProps<typeof buttonVariants> & {
    children?: React.ReactNode;
  };

function IconButton({
  className,
  onClick,
  variant,
  size,
  children,
  ...props
}: IconButtonProps): React.JSX.Element {
  const [isActive, setIsActive] = React.useState(false);
  const [key, setKey] = React.useState(0);

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      setKey((prev) => prev + 1);
      setIsActive(true);
      onClick?.(e);
    },
    [onClick],
  );

  return (
    <Particles asChild animate={isActive} key={key}>
      <ButtonPrimitive
        data-slot="icon-button"
        className={cn(buttonVariants({ variant, size, className }))}
        onClick={handleClick}
        {...props}
      >
        {children}
        <ParticlesEffect
          data-variant={variant}
          className="size-1 rounded-full bg-neutral-500"
        />
      </ButtonPrimitive>
    </Particles>
  );
}

export { IconButton };
