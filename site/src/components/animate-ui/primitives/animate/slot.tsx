"use client";

import { type HTMLMotionProps, isMotionComponent, motion } from "motion/react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type AnyProps = Record<string, unknown>;

export type DOMMotionProps<T extends HTMLElement = HTMLElement> = Omit<
  HTMLMotionProps<keyof HTMLElementTagNameMap>,
  "ref"
> & { ref?: React.Ref<T> };

export type WithAsChild<Base extends object> =
  | (Base & { asChild: true; children: React.ReactElement })
  | (Base & { asChild?: false | undefined });

export type SlotProps<T extends HTMLElement = HTMLElement> = {
  children?: React.ReactNode;
} & DOMMotionProps<T>;

function mergeRefs<T>(
  ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
  return (node: T | null): void => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") {
        ref(node);
      } else {
        (ref as React.RefObject<T | null>).current = node;
      }
    });
  };
}

function mergeProps<T extends HTMLElement>(
  childProps: AnyProps,
  slotProps: DOMMotionProps<T>,
): AnyProps {
  const merged: AnyProps = { ...childProps, ...slotProps };

  if (childProps.className || slotProps.className) {
    merged.className = cn(
      childProps.className as string,
      slotProps.className as string,
    );
  }

  if (childProps.style || slotProps.style) {
    merged.style = {
      ...(childProps.style as React.CSSProperties),
      ...(slotProps.style as React.CSSProperties),
    };
  }

  return merged;
}

function Slot<T extends HTMLElement = HTMLElement>({
  children,
  ref,
  ...props
}: SlotProps<T>): React.JSX.Element | null {
  const child = React.isValidElement(children) ? children : null;
  const childType = child === null ? null : (child.type as React.ElementType);

  const isAlreadyMotion =
    typeof childType === "object" &&
    childType !== null &&
    isMotionComponent(childType);

  const Base = React.useMemo(() => {
    if (childType === null) return null;
    return isAlreadyMotion ? childType : motion.create(childType);
  }, [isAlreadyMotion, childType]);

  if (child === null || Base === null) return null;

  const { ref: childRef, ...childProps } = child.props as AnyProps;

  const mergedProps = mergeProps(childProps, props);

  return (
    <Base {...mergedProps} ref={mergeRefs(childRef as React.Ref<T>, ref)} />
  );
}

export { Slot };
