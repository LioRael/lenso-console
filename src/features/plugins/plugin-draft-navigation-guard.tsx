import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import { useBlocker } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";

import type { PluginConfigurationDraftStore } from "./plugin-configuration-draft";

export function PluginDraftNavigationGuard({
  store,
}: {
  store: PluginConfigurationDraftStore;
}) {
  const dirty = useSyncExternalStore(
    store.subscribeAll,
    store.hasDrafts,
    store.hasDrafts
  );
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      store.hasDrafts() && current.pathname !== next.pathname,
    enableBeforeUnload: dirty,
    withResolver: true,
  });
  return (
    <Dialog.Root
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open && blocker.status === "blocked") {
          blocker.reset();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Viewport>
          <Dialog.Popup>
            <Dialog.Header>
              <div>
                <Dialog.Title>Leave without saving?</Dialog.Title>
                <Dialog.Description>
                  Your configuration changes have not been published. Leaving
                  this page will discard the local draft.
                </Dialog.Description>
              </div>
              <Dialog.Close />
            </Dialog.Header>
            <Dialog.Footer>
              <Button
                size="compact"
                variant="secondary"
                onClick={() => {
                  if (blocker.status === "blocked") {
                    blocker.reset();
                  }
                }}
              >
                Keep editing
              </Button>
              <Button
                size="compact"
                variant="primary"
                onClick={() => {
                  if (blocker.status === "blocked") {
                    blocker.proceed();
                  }
                }}
              >
                Leave page
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
