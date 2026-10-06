import type { ReactElement } from "react";
import { LOGO_FACE_SRC, LOGO_MARK_SRC } from "@/lib/assets";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-12 rounded-[8px] border-border shadow-shadow-md",
  lg: "size-18 rounded-[10px] border-border shadow-shadow",
} as const;

const INVERSE_SIZES = {
  sm: "size-12 rounded-[8px] border-white shadow-[3px_3px_0px_0px_var(--color-white)]",
  lg: "size-18 rounded-[10px] border-white shadow-[4px_4px_0px_0px_var(--color-white)]",
} as const;

const MARKS = {
  axolotl: { src: LOGO_MARK_SRC, tile: "bg-main" },
  // The black border keeps the white tile apart from the white shadow on the dark footer.
  face: { src: LOGO_FACE_SRC, tile: "border-black bg-white" },
} as const;

type LogoProps = {
  /** `sm` is 48px, `lg` 72px. */
  size?: keyof typeof SIZES;
  /** The image's `alt` text. Leave unset when visible text beside the mark already names the site, so screen readers skip the image. */
  label?: string;
  /** White border and shadow, for dark backgrounds such as the footer. */
  inverse?: boolean;
  /** `axolotl` is the whole animal on the pink tile, `face` the eyes, smile and cheeks on white, as in the favicon. */
  mark?: keyof typeof MARKS;
  className?: string;
};

export function Logo({
  size = "sm",
  label,
  inverse = false,
  mark = "axolotl",
  className,
}: LogoProps): ReactElement {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden border-2",
        (inverse ? INVERSE_SIZES : SIZES)[size],
        MARKS[mark].tile,
        className,
      )}
    >
      <img
        alt={label ?? ""}
        className="size-full object-contain"
        decoding="async"
        height={size === "sm" ? 48 : 72}
        src={MARKS[mark].src}
        width={size === "sm" ? 48 : 72}
      />
    </span>
  );
}
