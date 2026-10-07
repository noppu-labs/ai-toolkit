import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import {
  type CSSProperties,
  type ReactElement,
  useCallback,
  useState,
} from "react";
import { type CatalogSkill, SKILL_ROW_ATTRIBUTE } from "@/lib/catalog";
import { pluginColorClass, pluginColorVar } from "@/lib/plugins";
import { cn } from "@/lib/utils";
import { SkillDetailBody, SkillPosition } from "./SkillDetail.tsx";

interface SkillSheetProps {
  /** The skill to show; `null` closes the sheet. */
  skill: CatalogSkill | null;
  position: number | null;
  total: number;
  onClose: () => void;
}

/** The phone detail view: a modal bottom sheet over the list. */
export function SkillSheet({
  skill,
  position,
  total,
  onClose,
}: SkillSheetProps): ReactElement {
  // The last skill shown, so the sheet keeps its content while it closes.
  const [shown, setShown] = useState(skill);
  if (skill !== null && skill !== shown) {
    setShown(skill);
  }

  const handleOpenChange = useCallback(
    (open: boolean): void => {
      if (!open) {
        onClose();
      }
    },
    [onClose],
  );

  // Back to the row that opened the sheet, which a deep link never focused.
  const returnFocus = useCallback((): HTMLElement | boolean => {
    if (shown === null) {
      return true;
    }
    const row = document.querySelector<HTMLElement>(
      `[${SKILL_ROW_ATTRIBUTE}="${CSS.escape(shown.name)}"]`,
    );
    return row ?? true;
  }, [shown]);

  const accent: CSSProperties & Record<"--sheet-accent", string> = {
    "--sheet-accent": pluginColorVar(shown?.plugin ?? ""),
  };

  return (
    <Dialog.Root onOpenChange={handleOpenChange} open={skill !== null}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          className="fixed inset-x-0 bottom-0 mx-auto max-h-[86dvh] max-w-xl overflow-y-auto overscroll-contain rounded-t-[18px] border-border border-t-3 bg-secondary-background px-4 pt-2.5 pb-6 text-foreground shadow-[0_-6px_0_0_var(--sheet-accent)] outline-hidden transition-transform duration-200 data-ending-style:translate-y-full data-starting-style:translate-y-full motion-reduce:transition-none min-[36rem]:border-x-3"
          finalFocus={returnFocus}
          style={accent}
        >
          {shown === null ? null : (
            <>
              <div
                aria-hidden="true"
                className="mx-auto mb-2.5 h-1.25 w-11 rounded-full bg-muted-foreground opacity-50"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      "rounded-base border-2 border-border px-2.5 py-0.75 font-bold font-mono text-black text-xs",
                      pluginColorClass(shown.plugin),
                    )}
                  >
                    {shown.plugin}
                  </span>
                  <SkillPosition
                    className="text-muted-foreground"
                    position={position}
                    total={total}
                  />
                </div>
                <Dialog.Close
                  aria-label="Close"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-base border-2 border-edge bg-background text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary-background"
                >
                  <X
                    aria-hidden="true"
                    className="size-4.5"
                    strokeWidth={2.5}
                  />
                </Dialog.Close>
              </div>
              <Dialog.Title className="mt-2.5 break-words font-mono text-2xl leading-[1.15]">
                {shown.name}
              </Dialog.Title>
              <SkillDetailBody skill={shown} surface="sheet" />
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
