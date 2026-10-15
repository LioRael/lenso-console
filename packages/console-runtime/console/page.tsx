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
import * as stylex from "@stylexjs/stylex";
import { RefreshCw } from "lucide-react";
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

      <p {...stylex.props(styles.intro)}>
        Inspect declared capabilities and the host’s connected Runtime.
      </p>
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
        <p {...stylex.props(styles.description)}>
          A snapshot of this host’s Runtime kernel. Registered capabilities,
          instances and calls may differ from the static build manifest.
        </p>
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
