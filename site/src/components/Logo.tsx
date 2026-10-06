import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`;

const SIZES = {
  sm: "size-12 shadow-shadow-md",
  lg: "size-18 shadow-shadow",
} as const;

type LogoProps = {
  /** `sm` is the 48px nav mark, `lg` the 72px footer mark. */
  size?: keyof typeof SIZES;
  /**
   * The accessible name. Leave it unset when the mark sits next to visible
   * text that already names the site, so the image is decorative.
   */
  label?: string;
  className?: string;
};

/** The axolotl mark on a pink, bordered tile with a hard shadow. */
export function Logo({
  size = "sm",
  label,
  className,
}: LogoProps): ReactElement {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] border-2 border-border bg-main",
        SIZES[size],
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
