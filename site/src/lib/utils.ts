import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The neobrutalism theme scales in css/tokens/semantic.css; without them
// tailwind-merge reads `shadow-shadow` as a colour and `font-heading` as a family.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["shadow", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"],
      "font-weight": ["base", "heading"],
      radius: ["base"],
      spacing: [
        "boxShadowX",
        "boxShadowY",
        "reverseBoxShadowX",
        "reverseBoxShadowY",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
