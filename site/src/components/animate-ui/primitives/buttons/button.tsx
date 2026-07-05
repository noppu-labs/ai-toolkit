"use client";

import { type HTMLMotionProps, motion } from "motion/react";
import type * as React from "react";

import {
  Slot,
  type WithAsChild,
} from "@/components/animate-ui/primitives/animate/slot";

export type ButtonProps = WithAsChild<
  HTMLMotionProps<"button"> & {
    hoverScale?: number;
    tapScale?: number;
  }
>;

function Button({
  hoverScale = 1.05,
  tapScale = 0.95,
  asChild = false,
  ...props
}: ButtonProps): React.JSX.Element {
  const Component = (asChild ? Slot : motion.button) as React.ElementType;

  return (
    <Component
      whileTap={{ scale: tapScale }}
      whileHover={{ scale: hoverScale }}
      {...props}
    />
  );
}

export { Button };
