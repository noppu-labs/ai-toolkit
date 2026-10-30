import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type { VariantProps } from "class-variance-authority";
import type * as React from "react";

import { tabsListVariants } from "@/components/ui/tabs-variants";
import { cn } from "@/lib/utils";

function Tabs({
  className,
  ...props
}: Omit<React.ComponentProps<typeof TabsPrimitive.Root>, "className"> & {
  className?: string | undefined;
}): React.JSX.Element {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn(
        "w-full data-[orientation=vertical]:flex data-[orientation=vertical]:items-start data-[orientation=vertical]:gap-2",
        className,
      )}
      {...props}
    />
  );
}

function TabsList({
  className,
  variant = "default",
  ...props
}: Omit<React.ComponentProps<typeof TabsPrimitive.List>, "className"> &
  VariantProps<typeof tabsListVariants> & {
    className?: string | undefined;
  }): React.JSX.Element {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: Omit<React.ComponentProps<typeof TabsPrimitive.Tab>, "className"> & {
  className?: string | undefined;
}): React.JSX.Element {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 rounded-base border-2 border-transparent px-2 py-1 text-sm font-heading whitespace-nowrap ring-offset-white transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-active:border-border data-active:bg-main data-active:text-main-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "after:pointer-events-none after:absolute after:hidden after:bg-main after:opacity-0 after:transition-opacity group-data-[variant=line]/tabs-list:after:block data-[orientation=horizontal]:after:inset-x-0 data-[orientation=horizontal]:after:-bottom-0.5 data-[orientation=horizontal]:after:h-1 data-[orientation=vertical]:after:inset-y-0 data-[orientation=vertical]:after:-right-0.5 data-[orientation=vertical]:after:w-1",
        "group-data-[variant=line]/tabs-list:data-active:border-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:text-foreground group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: Omit<React.ComponentProps<typeof TabsPrimitive.Panel>, "className"> & {
  className?: string | undefined;
}): React.JSX.Element {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "mt-2 ring-offset-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none data-[orientation=vertical]:mt-0 data-[orientation=vertical]:flex-1",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
