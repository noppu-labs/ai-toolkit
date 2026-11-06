import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { useConsentStore } from "@/stores/useConsentStore";

function handleOpen(): void {
  useConsentStore.getState().openSettings();
}

/** The privacy page's way back to the consent choice. */
export function CookieSettingsButton(): ReactElement {
  return (
    <Button onClick={handleOpen} variant="neutral">
      Cookie settings
    </Button>
  );
}
