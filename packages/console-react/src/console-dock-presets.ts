import type { ConsoleDockPreset, ConsolePreferences } from "./composition";

export function consoleDockPresets(value: ConsolePreferences) {
  return (
    value.dockPresets ?? {
      version: 1 as const,
      activeId: "default",
      presets: [{ id: "default", name: "Default", pinned: value.pinned }],
    }
  );
}

/** Keep the legacy projection coherent for hosts that still read pinned. */
export function withConsoleDockPresets(
  value: ConsolePreferences,
  presets: readonly ConsoleDockPreset[],
  activeId: string
): ConsolePreferences {
  const active = presets.find((preset) => preset.id === activeId);
  if (!active) {
    throw new TypeError("Unknown active Dock preset");
  }
  return {
    ...value,
    pinned: active.pinned,
    dockPresets: { version: 1, activeId, presets },
  };
}

export function updateConsoleDockPins(
  value: ConsolePreferences,
  pinned: ConsolePreferences["pinned"]
) {
  const document = consoleDockPresets(value);
  return withConsoleDockPresets(
    value,
    document.presets.map((preset) =>
      preset.id === document.activeId ? { ...preset, pinned } : preset
    ),
    document.activeId
  );
}
