import {
  ConsoleIconButton,
  ConsoleLayout,
  ConsolePageScope,
  useConsoleActivation,
} from "@lenso/console-react";
import {
  runtimeCatalogueSchema,
  runtimeSnapshotSchema,
  type RuntimeCatalogue,
  type RuntimeSnapshot,
} from "@lenso/console-runtime/client";
import { definePage, type PageProps } from "@lenso/console-sdk";
import { useWorkspaceRead } from "@lenso/console-sdk/react";
import { ThemeScope } from "@lenso/ui";
import { Popover } from "@lenso/ui/popover";
import * as stylex from "@stylexjs/stylex";
import { Info, RefreshCw } from "lucide-react";
import { useRef } from "react";

import { CapabilityDirectory } from "./capability-directory";
import { styles } from "./page.styles";
import { RuntimeDiagnostics } from "./runtime-diagnostics";

function RuntimePage(props: PageProps) {
  const lifetime = useConsoleActivation(
    props.activation?.key ?? props.mount,
    props.signal
  );
  return (
    <RuntimeContent
      key={lifetime.activation.key}
      {...props}
      activation={props.activation ?? lifetime.activation}
      signal={lifetime.signal}
    />
  );
}

function RuntimeContent({
  services,
  activation,
  signal,
}: PageProps & { activation: NonNullable<PageProps["activation"]> }) {
  const status = useWorkspaceRead({
    key: "runtime.status",
    params: {},
    read: async ({ signal: readSignal }) =>
      runtimeSnapshotSchema.parse(
        await services.invoke<Record<string, never>, RuntimeSnapshot>(
          "runtime",
          "status",
          {},
          { signal: readSignal }
        )
      ),
  });
  const catalogue = useWorkspaceRead({
    key: "runtime.catalogue",
    params: {},
    read: async ({ signal: readSignal }) =>
      runtimeCatalogueSchema.parse(
        await services.invoke<Record<string, never>, RuntimeCatalogue>(
          "runtime",
          "catalogue",
          {},
          { signal: readSignal }
        )
      ),
  });
  const refreshLock = useRef(false);
  const refreshing = status.refreshing || catalogue.refreshing;

  async function refresh() {
    if (
      refreshLock.current ||
      refreshing ||
      signal.aborted ||
      !activation.isCurrent()
    ) {
      return;
    }
    refreshLock.current = true;
    try {
      // Each read owns its error state and retains its last successful snapshot.
      await Promise.allSettled([status.refetch(), catalogue.refetch()]);
    } finally {
      refreshLock.current = false;
    }
  }

  return (
    <main aria-label="Runtime" {...stylex.props(styles.page)}>
      <ConsolePageScope
        scopeKey={activation.key}
        value={{ context: { kind: "object", label: "Runtime" } }}
      />
      <ConsoleLayout.Corner area="topRight">
        <ConsoleIconButton
          label="Refresh runtime"
          tooltip="Refresh runtime"
          side="bottom"
          variant="secondary"
          disabled={refreshing || status.blocking || catalogue.blocking}
          onClick={() => void refresh()}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </ConsoleIconButton>
      </ConsoleLayout.Corner>

      <ConsoleLayout.Corner area="bottomLeft">
        <Popover.Root>
          <Popover.Trigger
            render={
              <ConsoleIconButton
                label="Runtime information"
                variant="secondary"
              />
            }
          >
            <Info size={18} aria-hidden="true" />
          </Popover.Trigger>
          <ThemeScope>
            <Popover.Portal>
              <Popover.Positioner side="top" align="start" sideOffset={8}>
                <Popover.Popup xstyle={styles.information}>
                  <Popover.Title>Runtime inspection</Popover.Title>
                  <p {...stylex.props(styles.description)}>
                    The capability directory is a static build manifest, not
                    proof that a service is registered or callable. Live
                    diagnostics are a separate snapshot of the host kernel.
                  </p>
                  <p {...stylex.props(styles.description)}>
                    Recent outcomes contain bounded terminal metadata, newest
                    first. Request and response payloads are not shown. Refresh
                    to read a new snapshot.
                  </p>
                  <p {...stylex.props(styles.description)}>
                    {catalogue.data?.greetingTrial.enabled && !catalogue.error
                      ? "The host allows a side-effect-free greeting trial. Open the trial from the flask button."
                      : "Greeting trial is unavailable. This view exposes read-only diagnostics."}
                  </p>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </ThemeScope>
        </Popover.Root>
      </ConsoleLayout.Corner>
      {refreshing ? (
        <output {...stylex.props(styles.message)}>
          Refreshing runtime diagnostics…
        </output>
      ) : null}

      <CapabilityDirectory
        catalogue={catalogue}
        services={services}
        signal={signal}
        activation={activation}
      />

      <section {...stylex.props(styles.section)} aria-label="Live diagnostics">
        <h2 {...stylex.props(styles.title)}>Live diagnostics</h2>
        {status.error ? (
          <p role="alert" {...stylex.props(styles.message)}>
            Runtime diagnostics could not be read. Refresh to try again.
            {status.data ? " Showing the last successful snapshot." : ""}
          </p>
        ) : null}
        {!status.data && !status.error ? (
          <output aria-busy="true" {...stylex.props(styles.message)}>
            Loading runtime diagnostics…
          </output>
        ) : null}
        {status.data ? <RuntimeDiagnostics snapshot={status.data} /> : null}
      </section>
    </main>
  );
}

export default definePage(RuntimePage);
