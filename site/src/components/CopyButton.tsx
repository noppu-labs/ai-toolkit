import type { VariantProps } from "class-variance-authority";
import { Check, Copy } from "lucide-react";
import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import type { buttonVariants } from "@/components/ui/button-variants";

type CopyButtonProps = Omit<
  ComponentProps<typeof Button>,
  "aria-label" | "children" | "onClick" | "content"
> &
  VariantProps<typeof buttonVariants> & {
    /** The text written to the clipboard. */
    content: string;
    /** The accessible name; it stays the same in the copied state. */
    "aria-label": string;
    /** An optional visible label next to the icon. */
    label?: ReactNode;
    /** The visible label while copied (only shown when `label` is set). */
    copiedLabel?: ReactNode;
    /** How long the copied state lasts, in milliseconds. */
    resetAfter?: number;
    onCopied?: (content: string) => void;
  };

/** A neobrutalism button that copies `content` to the clipboard. */
export function CopyButton({
  content,
  label,
  copiedLabel = "Copied",
  resetAfter = 2000,
  onCopied,
  variant = "neutral",
  size,
  ...props
}: CopyButtonProps): ReactElement {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), resetAfter);
    return (): void => window.clearTimeout(timer);
  }, [copied, resetAfter]);

  const handleClick = useCallback((): void => {
    navigator.clipboard
      .writeText(content)
      .then(() => {
        setCopied(true);
        onCopied?.(content);
      })
      .catch((error: unknown) => {
        console.error("Could not copy to the clipboard", error);
      });
  }, [content, onCopied]);

  const Icon = copied ? Check : Copy;
  const announcement = copied ? "Copied to clipboard" : "";
  const iconOnly = label === undefined;
  const visibleLabel = copied ? copiedLabel : label;

  return (
    <Button
      data-copied={copied}
      size={size ?? (iconOnly ? "icon" : "default")}
      variant={variant}
      {...props}
      onClick={handleClick}
    >
      <Icon aria-hidden="true" />
      {iconOnly ? null : <span>{visibleLabel}</span>}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </Button>
  );
}
