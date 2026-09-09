import { StatusMarker } from "@lenso/ui/status-marker";

import { useConsoleTranslation } from "../../app/console-i18n";
import type { PluginStatusPresentation } from "./plugin-runtime-state";

export function PluginStatus({ state }: { state: PluginStatusPresentation }) {
  const t = useConsoleTranslation();
  return (
    <StatusMarker
      aria-label={`${t(state.label)}. ${t(state.description)}`}
      presentation="label"
      status={state.tone}
      title={t(state.description)}
    >
      {t(state.label)}
    </StatusMarker>
  );
}
