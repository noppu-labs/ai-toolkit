import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { VariantProps } from "class-variance-authority";
import type * as React from "react";

import { badgeVariants } from "@/components/ui/badge-variants";
import { cn } from "@/lib/utils";

function Badge({
  className,
  variant,
  render,
  ...props
}: useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>): React.ReactElement {
  return useRender({
    defaultTagName: "span",
    render,
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    state: {
      slot: "badge",
      variant: variant ?? "default",
    },
  });
}

export { Badge };
