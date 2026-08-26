import {
  DataGrid,
  DataRow,
  PaneHeader,
  TableHeader,
  useConsoleLocale,
} from "@lenso/console-ui";
import { useState } from "react";

import {
  Inspector,
  InspectorSection,
  ProductPage,
  SplitWorkspace,
  StatusDot,
} from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";
import {
  shortPluginDigest,
  type PluginGenerationState,
} from "./plugin-workbench-model";
import { usePluginWorkbench } from "./use-plugin-workbench";

export function PluginWorkbenchPage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale).plugins;
  const workbench = usePluginWorkbench();
  const projection = workbench.data;
  const plugins = projection?.plugins ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected =
    plugins.find((plugin) => plugin.instanceKey === selectedKey) ?? plugins[0];

  return (
    <ProductPage
      description={copy.description}
      meta={
        <StatusDot
          label={`${workbench.mode === "live" ? copy.live : copy.demo} · ${streamLabel(workbench.streamState, copy)}`}
          tone={workbench.streamState === "live" ? "success" : "neutral"}
        />
      }
      pageKind="plugin-workbench-page"
      title={copy.title}
    >
      <SplitWorkspace
        inspector={
          selected && projection ? (
            <Inspector
              pageSlot="plugin-workbench-inspector"
              status={
                <StatusDot
                  label={stateLabel(selected.state, copy)}
                  tone={stateTone(selected.state)}
                />
              }
              subtitle={selected.packageId}
              title={selected.instanceKey}
            >
              <InspectorSection title={copy.resolvedPackage}>
                <p>{selected.packageId}</p>
                <p>Version: {selected.packageVersion}</p>
                <p>Receipt: {shortPluginDigest(selected.receiptDigest)}</p>
              </InspectorSection>
              <InspectorSection title={copy.generation}>
                <p>{projection.generation.generationId}</p>
                <p>
                  Plan: {shortPluginDigest(projection.generation.planDigest)}
                </p>
                <p>
                  {copy.activated}:{" "}
                  {formatTimestamp(projection.generation.activatedAt)}
                </p>
              </InspectorSection>
              <InspectorSection title={copy.capabilities}>
                {selected.capabilityIds.map((capability) => (
                  <p key={capability}>{capability}</p>
                ))}
              </InspectorSection>
              <InspectorSection title={copy.evidence}>
                <p>
                  {copy.observed}: {formatTimestamp(projection.observedAt)}
                </p>
                <p>
                  {copy.streamCursor}: {projection.stream.cursor}
                </p>
              </InspectorSection>
              <InspectorSection title={copy.authority}>
                <p>{copy.readOnly}</p>
                <p>{copy.hostAuthority}</p>
              </InspectorSection>
            </Inspector>
          ) : (
            <p data-page-slot="plugin-workbench__empty">{copy.noPlugins}</p>
          )
        }
        pageSlot="plugin-workbench__workspace"
      >
        <section data-page-slot="plugin-workbench__table-pane">
          <PaneHeader
            meta={`${plugins.length} ${copy.pluginCount}`}
            title={copy.activeGeneration}
          />
          <DataGrid>
            <TableHeader
              columns={[copy.plugin, copy.package, copy.version, copy.state]}
            />
            {plugins.map((plugin) => (
              <DataRow
                cells={[
                  plugin.packageId,
                  plugin.packageVersion,
                  <StatusDot
                    key={`${plugin.instanceKey}-state`}
                    label={stateLabel(plugin.state, copy)}
                    tone={stateTone(plugin.state)}
                  />,
                ]}
                interactive
                key={plugin.instanceKey}
                onActivate={() => setSelectedKey(plugin.instanceKey)}
                onClick={() => setSelectedKey(plugin.instanceKey)}
                primary={plugin.instanceKey}
                secondary={shortPluginDigest(plugin.receiptDigest)}
                selected={selected?.instanceKey === plugin.instanceKey}
              />
            ))}
          </DataGrid>
        </section>
      </SplitWorkspace>
    </ProductPage>
  );
}

function stateTone(state: PluginGenerationState) {
  if (state === "active" || state === "standby") {
    return "success" as const;
  }
  if (state === "failed") {
    return "error" as const;
  }
  return "warning" as const;
}

function stateLabel(
  state: PluginGenerationState,
  copy: ReturnType<typeof consoleProductCopy>["plugins"]
) {
  return copy.states[state];
}

function streamLabel(
  state: ReturnType<typeof usePluginWorkbench>["streamState"],
  copy: ReturnType<typeof consoleProductCopy>["plugins"]
) {
  return copy.streamStates[state];
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}
