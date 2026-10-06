import type { ReactElement } from "react";
import { LOGO_SRC } from "@/lib/assets";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-12 rounded-[8px] border-border shadow-shadow-md",
  lg: "size-18 rounded-[10px] border-border shadow-shadow",
} as const;

const INVERSE_SIZES = {
  sm: "size-12 rounded-[8px] border-white shadow-[3px_3px_0px_0px_var(--color-white)]",
  lg: "size-18 rounded-[10px] border-white shadow-[4px_4px_0px_0px_var(--color-white)]",
} as const;

type LogoProps = {
  /** `sm` is the 48px nav mark, `lg` the 72px footer mark. */
  size?: keyof typeof SIZES;
  /**
   * The accessible name. Leave it unset when the mark sits next to visible
   * text that already names the site, so the image is decorative.
   */
  label?: string;
  /** White border and shadow, for dark surfaces such as the footer. */
  inverse?: boolean;
  className?: string;
};

/** The axolotl mark on a pink, bordered tile with a hard shadow. */
export function Logo({
  size = "sm",
  label,
  inverse = false,
  className,
}: LogoProps): ReactElement {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden border-2 bg-main",
        (inverse ? INVERSE_SIZES : SIZES)[size],
        className,
      )}
    >
      <img
        alt={label ?? ""}
        className="size-full scale-140 object-cover"
        decoding="async"
        height={size === "sm" ? 48 : 72}
        src={LOGO_SRC}
        width={size === "sm" ? 48 : 72}
      />
    </span>
  );
}
