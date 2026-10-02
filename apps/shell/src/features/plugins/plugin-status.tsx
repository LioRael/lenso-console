import { Chip } from "@lenso/ui/chip";

import { useConsoleTranslation } from "../../app/console-i18n";
import type { PluginStatusPresentation } from "./plugin-runtime-state";

export function PluginStatus({ state }: { state: PluginStatusPresentation }) {
  const t = useConsoleTranslation();
  return (
    <Chip
      aria-label={`${t(state.label)}. ${t(state.description)}`}
      size="sm"
      variant="soft"
      color={
        state.tone === "error"
          ? "danger"
          : state.tone === "info"
            ? "accent"
            : state.tone === "neutral"
              ? "default"
              : state.tone
      }
      title={t(state.description)}
    >
      {t(state.label)}
    </Chip>
  );
}
