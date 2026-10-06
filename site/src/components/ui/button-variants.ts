import { cva } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-base font-base text-sm ring-offset-white transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-2 border-border bg-main text-main-foreground shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
        noShadow: "border-2 border-border bg-main text-main-foreground",
        neutral:
          "border-2 border-border bg-secondary-background text-foreground shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
        reverse:
          "border-2 border-border bg-main text-main-foreground hover:translate-x-reverseBoxShadowX hover:translate-y-reverseBoxShadowY hover:shadow-shadow",
        // Compatibility aliases for call sites written against the shadcn
        // variant names (removed once the sections are rewritten).
        outline:
          "border-2 border-border bg-secondary-background text-foreground shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
        ghost: "border-2 border-transparent hover:border-border",
      },
      size: {
        default: "h-10 px-4 py-2",
        xs: "h-8 gap-1.5 px-2.5 text-xs [&_svg]:size-3.5",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "size-10",
        "icon-xs": "size-8 [&_svg]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export { buttonVariants };
