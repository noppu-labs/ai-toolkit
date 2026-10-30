import { cva } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-base border-2 border-border px-2.5 py-0.5 text-xs font-base whitespace-nowrap focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        neutral: "bg-secondary-background text-foreground",
        main: "bg-main text-main-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export { badgeVariants };
