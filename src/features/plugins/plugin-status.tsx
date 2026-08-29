import { StatusMarker } from "@lenso/ui/status-marker";

import type { PluginStatusPresentation } from "./plugin-runtime-state";

export function PluginStatus({ state }: { state: PluginStatusPresentation }) {
  return (
    <StatusMarker
      aria-label={`${state.label}. ${state.description}`}
      presentation="label"
      status={state.tone}
      title={state.description}
    >
      {state.label}
    </StatusMarker>
  );
}
