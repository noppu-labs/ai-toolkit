import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import { toggleVariants } from "@/components/ui/toggle-variants";
import { cn } from "@/lib/utils";

type ToggleGroupContextValue = VariantProps<typeof toggleVariants> & {
  spacing?: number;
  orientation?: "horizontal" | "vertical";
};

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({
  size: "default",
  variant: "default",
  spacing: 2,
  orientation: "horizontal",
});

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  children,
  ...props
}: Omit<ToggleGroupPrimitive.Props, "className"> &
  ToggleGroupContextValue & {
    className?: string | undefined;
  }): React.JSX.Element {
  const context = React.useMemo(
    () => ({ variant, size, spacing, orientation }),
    [variant, size, spacing, orientation],
  );
  const style: React.CSSProperties & Record<"--gap", number> = {
    "--gap": spacing,
  };
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      orientation={orientation}
      style={style}
      className={cn(
        "group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-base data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={context}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}: Omit<TogglePrimitive.Props, "className"> &
  VariantProps<typeof toggleVariants> & {
    className?: string | undefined;
  }): React.JSX.Element {
  const context = React.useContext(ToggleGroupContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        "shrink-0 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:border-t-0 group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:border-l-0 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:last:rounded-r-base group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:last:rounded-b-base group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:first:rounded-t-base group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:first:rounded-l-base group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:first:border-t-2 group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:first:border-l-2",
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
