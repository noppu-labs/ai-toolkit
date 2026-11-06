import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { useConsentStore } from "@/stores/useConsentStore";

function handleOpen(): void {
  useConsentStore.getState().openSettings();
}

export function CookieSettingsButton(): ReactElement {
  return (
    <Button onClick={handleOpen} variant="neutral">
      Cookie settings
    </Button>
  );
}
