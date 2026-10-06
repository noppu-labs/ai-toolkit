import type * as React from "react";

import { cn } from "@/lib/utils";

function Label({
  className,
  htmlFor,
  children,
  ...props
}: React.ComponentProps<"label">): React.JSX.Element {
  return (
    <label
      data-slot="label"
      htmlFor={htmlFor}
      className={cn(
        "font-heading text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-70",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

export { Label };
