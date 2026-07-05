"use client";

import type { VariantProps } from "class-variance-authority";
import { CheckIcon, CopyIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { buttonVariants } from "@/components/animate-ui/components/buttons/button-variants";
import {
  Button as ButtonPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
} from "@/components/animate-ui/primitives/buttons/button";
import { useControlledState } from "@/hooks/use-controlled-state";
import { cn } from "@/lib/utils";

export type CopyButtonProps = Omit<ButtonPrimitiveProps, "children"> &
  VariantProps<typeof buttonVariants> & {
    content: string;
    copied?: boolean;
    onCopiedChange?: (copied: boolean, content?: string) => void;
    delay?: number;
  };

function CopyButton({
  className,
  content,
  copied,
  onCopiedChange,
  onClick,
  variant,
  size,
  delay = 3000,
  ...props
}: CopyButtonProps): React.JSX.Element {
  const [isCopied, setIsCopied] = useControlledState({
    value: copied,
    onChange: onCopiedChange,
  });

  const handleCopy = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      if (copied) return;
      if (content) {
        navigator.clipboard
          .writeText(content)
          .then(() => {
            setIsCopied(true);
            onCopiedChange?.(true, content);
            setTimeout(() => {
              setIsCopied(false);
              onCopiedChange?.(false);
            }, delay);
          })
          .catch((error) => {
            console.error("Error copying command", error);
          });
      }
    },
    [onClick, copied, content, setIsCopied, onCopiedChange, delay],
  );

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <ButtonPrimitive
      data-slot="copy-button"
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={handleCopy}
      {...props}
    >
      <AnimatePresence mode="popLayout">
        <motion.span
          key={isCopied ? "check" : "copy"}
          data-slot="copy-button-icon"
          initial={{ scale: 0, opacity: 0.4, filter: "blur(4px)" }}
          animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
          exit={{ scale: 0, opacity: 0.4, filter: "blur(4px)" }}
          transition={{ duration: 0.25 }}
        >
          <Icon />
        </motion.span>
      </AnimatePresence>
    </ButtonPrimitive>
  );
}

export { CopyButton };
