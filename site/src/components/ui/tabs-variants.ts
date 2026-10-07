import { cva } from "class-variance-authority";

const tabsListVariants = cva(
  "group/tabs-list inline-flex items-center justify-center text-foreground data-[orientation=vertical]:h-fit data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
  {
    variants: {
      variant: {
        default: "h-12 rounded-base border-2 border-edge bg-background p-1",
        line: "gap-1 border-edge border-b-2 bg-transparent data-[orientation=vertical]:border-r-2 data-[orientation=vertical]:border-b-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export { tabsListVariants };
