"use client";

import { AnimatePresence, type HTMLMotionProps, motion } from "motion/react";
import * as React from "react";

import {
  Slot,
  type WithAsChild,
} from "@/components/animate-ui/primitives/animate/slot";
import { type UseIsInViewOptions, useIsInView } from "@/hooks/use-is-in-view";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

type ParticlesContextType = {
  animate: boolean;
  isInView: boolean;
};

const ParticlesContext = React.createContext<ParticlesContextType | undefined>(
  undefined,
);

function useParticles(): ParticlesContextType {
  const ctx = React.useContext(ParticlesContext);
  if (ctx === undefined) {
    throw new Error("useParticles must be used within ParticlesContext");
  }
  return ctx;
}

export type ParticlesProps = WithAsChild<
  Omit<HTMLMotionProps<"div">, "children"> & {
    animate?: boolean;
    children: React.ReactNode;
  } & UseIsInViewOptions
>;

function Particles({
  ref,
  animate = true,
  asChild = false,
  inView = false,
  inViewMargin = "0px",
  inViewOnce = true,
  children,
  style,
  ...props
}: ParticlesProps): React.JSX.Element {
  const { ref: localRef, isInView } = useIsInView(
    ref as React.Ref<HTMLDivElement>,
    { inView, inViewOnce, inViewMargin },
  );

  const Component = asChild ? Slot : motion.div;

  const contextValue = React.useMemo(
    () => ({ animate, isInView }),
    [animate, isInView],
  );

  return (
    <ParticlesContext.Provider value={contextValue}>
      <Component
        ref={localRef}
        style={{ position: "relative", ...style }}
        {...props}
      >
        {children}
      </Component>
    </ParticlesContext.Provider>
  );
}

export type ParticlesEffectProps = Omit<HTMLMotionProps<"div">, "children"> & {
  side?: Side;
  align?: Align;
  count?: number;
  radius?: number;
  spread?: number;
  duration?: number;
  holdDelay?: number;
  sideOffset?: number;
  alignOffset?: number;
  delay?: number;
};

function getEffectPosition(
  side: Side,
  align: Align,
  sideOffset: number,
  alignOffset: number,
): { top: string; left: string } {
  const alignPct = align === "start" ? "0%" : align === "end" ? "100%" : "50%";
  const alignCoord = `calc(${alignPct} + ${alignOffset}px)`;
  const sideStart = `calc(0% - ${sideOffset}px)`;
  const sideEnd = `calc(100% + ${sideOffset}px)`;

  if (side === "top" || side === "bottom") {
    return { top: side === "top" ? sideStart : sideEnd, left: alignCoord };
  }
  return { top: alignCoord, left: side === "left" ? sideStart : sideEnd };
}

type ParticleDescriptor = {
  id: string;
  x: number;
  y: number;
  delay: number;
};

function getParticleDescriptors(
  count: number,
  radius: number,
  spread: number,
  holdDelay: number,
  delay: number,
): ParticleDescriptor[] {
  const angleStep = (spread * (Math.PI / 180)) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, index) => {
    const angle = index * angleStep;
    return {
      id: `particle-${index}`,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      delay: delay + index * holdDelay,
    };
  });
}

function ParticlesEffect({
  side = "top",
  align = "center",
  count = 6,
  radius = 30,
  spread = 360,
  duration = 0.8,
  holdDelay = 0.05,
  sideOffset = 0,
  alignOffset = 0,
  delay = 0,
  transition,
  style,
  ...props
}: ParticlesEffectProps): React.JSX.Element {
  const { animate, isInView } = useParticles();

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    ...getEffectPosition(side, align, sideOffset, alignOffset),
    transform: "translate(-50%, -50%)",
  };

  const particles = getParticleDescriptors(
    count,
    radius,
    spread,
    holdDelay,
    delay,
  );

  return (
    <AnimatePresence>
      {animate && isInView
        ? particles.map((particle) => (
            <motion.div
              key={particle.id}
              style={
                { ...containerStyle, ...style } as NonNullable<
                  React.ComponentProps<typeof motion.div>["style"]
                >
              }
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                x: `${particle.x}px`,
                y: `${particle.y}px`,
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration,
                delay: particle.delay,
                ease: "easeOut",
                ...transition,
              }}
              {...props}
            />
          ))
        : null}
    </AnimatePresence>
  );
}

export { Particles, ParticlesEffect };
