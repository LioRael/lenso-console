import { Popover } from "@lenso/ui/popover";
import * as stylex from "@stylexjs/stylex";
import { Search } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ConsoleRouterAdapter } from "./composition";
import { ConsoleActionHost } from "./console-action-scope";
import { ConsoleCommand, useConsoleCommandFocus } from "./console-command";
import { ConsoleContextBar } from "./console-context-bar";
import { ConsoleDock } from "./console-dock";
import { useConsoleCommandKey } from "./console-dock-interactions";
import { ConsoleLayout } from "./console-layout";
import { shellStyles as styles } from "./console-shell.styles";

const hostStyles = stylex.create({ root: { display: "contents" } });

/**
 * Interaction presentation for externally routed pages. The host supplies
 * authorized navigation; this surface never discovers services or destinations.
 */
export function ConsoleInteractionHost({
  children,
  router,
  signal,
}: {
  children: ReactNode;
  router: Pick<ConsoleRouterAdapter, "pathname" | "navigate">;
  signal?: AbortSignal;
}) {
  const [open, setOpen] = useState(false);
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pointerIntent = useRef(true);
  const id = useId();
  const focus = useConsoleCommandFocus(open, dockRef);
  const resetFocus = focus.reset;
  const close = () => {
    focus.restore();
    setOpen(false);
  };
  const show = () => {
    if (signal?.aborted) {
      return;
    }
    if (open) {
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    pointerIntent.current = false;
    focus.capture();
    setOpen(true);
  };
  useConsoleCommandKey(!signal?.aborted, show, dockRef);
  useLayoutEffect(() => {
    setOpen(false);
    resetFocus();
  }, [router.pathname, resetFocus]);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => (next ? show() : close())}
    >
      <div
        {...stylex.props(hostStyles.root)}
        onPointerDownCapture={() => {
          pointerIntent.current = true;
        }}
        onKeyDownCapture={() => {
          pointerIntent.current = false;
        }}
      >
        <ConsoleActionHost
          signal={signal}
          render={(selection, page) => (
            <ConsoleLayout.Foreground>
              <ConsoleDock
                visible={!!selection || open || !!page?.commands?.length}
                position="bottom"
                compact={false}
                activeId=""
                items={
                  page?.commands?.length
                    ? [
                        {
                          id: "command",
                          label: "Command",
                          tooltip: "Command (⌘K / Ctrl+K)",
                          icon: <Search size={16} aria-hidden="true" />,
                        },
                      ]
                    : []
                }
                selection={selection}
                running={selection?.running ?? false}
                dockRef={dockRef}
                instant={open || !pointerIntent.current}
                directory={
                  open ? (
                    <div ref={setMount}>
                      {mount && (
                        <Popover.Portal container={mount}>
                          <Popover.Positioner
                            style={{
                              position: "relative",
                              top: 0,
                              left: 0,
                              transform: "none",
                              width: "100%",
                              opacity: 1,
                            }}
                            xstyle={styles.trayPositioner}
                          >
                            <Popover.Popup
                              id={id}
                              data-console-dock-view="command"
                              aria-label="Command"
                              initialFocus={inputRef}
                              finalFocus={focus.resolve}
                              xstyle={styles.tray}
                            >
                              <ConsoleCommand
                                inputRef={inputRef}
                                destinations={[]}
                                presets={[]}
                                actions={(page?.commands ?? []).map(
                                  (action) => ({
                                    ...action,
                                    onInvoke() {
                                      close();
                                      action.onInvoke();
                                    },
                                  })
                                )}
                                onClose={close}
                              />
                            </Popover.Popup>
                          </Popover.Positioner>
                        </Popover.Portal>
                      )}
                    </div>
                  ) : null
                }
                onNavigate={show}
                onExpand={show}
                onFocusDock={() => undefined}
              />
              <ConsoleContextBar
                context={page?.context}
                fallback={null}
                router={router}
                sidebar={false}
                instant={open || !pointerIntent.current}
              />
            </ConsoleLayout.Foreground>
          )}
        >
          {children}
        </ConsoleActionHost>
      </div>
    </Popover.Root>
  );
}
