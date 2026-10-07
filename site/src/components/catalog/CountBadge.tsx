import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

interface CountBadgeProps {
  count: number;
  className?: string;
}

/** A round skill count; screen readers hear "5 skills". */
export function CountBadge({
  count,
  className,
}: CountBadgeProps): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex h-6.5 min-w-6.5 shrink-0 items-center justify-center rounded-full px-1.75 font-bold font-sans text-[13px] tabular-nums leading-none",
        className,
      )}
    >
      {count}
      <span className="sr-only">{count === 1 ? " skill" : " skills"}</span>
    </span>
  );
}
