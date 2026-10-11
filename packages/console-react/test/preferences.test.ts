import { expect, test } from "bun:test";

import {
  consoleCommandKey,
  consolePresetOrdinal,
} from "../src/console-dock-interactions";
import {
  updateConsoleDockPins,
  withConsoleDockPresets,
} from "../src/console-dock-presets";
import { projectConsolePreferenceSnapshot } from "../src/console-preferences";

// Existing ordering tests use typed preferences; they cannot catch transport
// objects carrying secrets/components into the next preference save.
test("preference transport keeps only stable references and distinguishes absent from empty", () => {
  const result = projectConsolePreferenceSnapshot({
    revision: "1",
    value: {
      mode: "dock",
      position: "bottom",
      pinned: [
        {
          bindingId: "orders.primary",
          navigationId: "orders",
          title: "Discard this metadata",
        },
      ],
      privateValue: "test-only-field",
    },
  });
  expect(result.value).toEqual({
    mode: "dock",
    position: "bottom",
    pinned: [{ bindingId: "orders.primary", navigationId: "orders" }],
    dockPresets: {
      version: 1,
      activeId: "default",
      presets: [
        {
          id: "default",
          name: "Default",
          pinned: [{ bindingId: "orders.primary", navigationId: "orders" }],
        },
      ],
    },
  });
  expect(
    projectConsolePreferenceSnapshot({ revision: "0", value: null }).value
  ).toBeNull();
  expect(
    projectConsolePreferenceSnapshot({
      revision: "2",
      value: { mode: "dock", position: "bottom", pinned: [] },
    }).value?.pinned
  ).toEqual([]);
  expect(() =>
    projectConsolePreferenceSnapshot({
      revision: "2",
      value: { mode: "unrecognized", position: "bottom", pinned: [] },
    })
  ).toThrow();
});

// Legacy snapshots and typed pin-order tests have no multi-preset transport.
// Prevent migration dropping intentional emptiness or temporarily hidden pins,
// and edits to one preset overwriting another preset or global presentation.
test("migrates legacy pins and preserves independent preset references through projection and edits", () => {
  const hidden = { bindingId: "temporarily-forbidden", navigationId: "hidden" };
  const visible = { bindingId: "records", navigationId: "records" };
  const migrated = projectConsolePreferenceSnapshot({
    revision: "before",
    value: { mode: "sidebar", position: "left", pinned: [hidden, visible] },
  }).value!;
  expect(migrated.dockPresets?.presets[0]?.pinned).toEqual([hidden, visible]);
  const empty = projectConsolePreferenceSnapshot({
    revision: "empty",
    value: { mode: "dock", position: "bottom", pinned: [] },
  }).value!;
  expect(empty.dockPresets?.presets[0]?.pinned).toEqual([]);
  const second = withConsoleDockPresets(
    migrated,
    [
      ...migrated.dockPresets!.presets,
      { id: "custom", name: "My work", pinned: [] },
    ],
    "custom"
  );
  const edited = updateConsoleDockPins(second, [visible]);
  const projected = projectConsolePreferenceSnapshot({
    revision: "after",
    value: { ...edited, credential: "must-not-survive" },
  }).value!;
  expect(projected.mode).toBe("sidebar");
  expect(projected.position).toBe("left");
  expect(projected.pinned).toEqual([visible]);
  expect(projected.dockPresets!.presets[0]!.pinned).toEqual([hidden, visible]);
  expect(projected).not.toHaveProperty("credential");
  expect(
    withConsoleDockPresets(projected, projected.dockPresets!.presets, "default")
      .pinned
  ).toEqual([hidden, visible]);
  for (const document of [
    { ...projected.dockPresets, version: 99 },
    { ...projected.dockPresets, activeId: "missing" },
    { ...projected.dockPresets, presets: [] },
    {
      ...projected.dockPresets,
      presets: [
        projected.dockPresets!.presets[0],
        projected.dockPresets!.presets[0],
      ],
    },
  ]) {
    expect(() =>
      projectConsolePreferenceSnapshot({
        revision: "invalid",
        value: { ...projected, dockPresets: document },
      })
    ).toThrow();
  }
});

// Browser-only routing coverage cannot prove all native modifier exclusions.
test("preset ordinals never claim browser tab, composition, repeat or AltGraph shortcuts", () => {
  const event = {
    code: "Digit2",
    metaKey: true,
    ctrlKey: false,
    altKey: true,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    getModifierState: () => false,
  };
  expect(consolePresetOrdinal(event, true)).toBe(1);
  expect(
    consolePresetOrdinal({ ...event, metaKey: false, ctrlKey: true }, false)
  ).toBe(1);
  for (const excluded of [
    { altKey: false },
    { shiftKey: true },
    { isComposing: true },
    { repeat: true },
    { getModifierState: () => true },
    { ctrlKey: true },
    { code: "Digit0" },
  ]) {
    expect(consolePresetOrdinal({ ...event, ...excluded }, true)).toBeNull();
  }
  expect(consolePresetOrdinal(event, false)).toBeNull();
});

// Preset coverage cannot protect the independent Command shortcut, especially
// IME/defaultPrevented exclusions while ordinary text entry remains eligible.
test("Command accepts only the platform primary modifier and respects already handled events", () => {
  const event = {
    key: "k",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    defaultPrevented: false,
  };
  expect(consoleCommandKey(event, true)).toBe(true);
  expect(consoleCommandKey({ ...event, key: "K" }, true)).toBe(true);
  expect(
    consoleCommandKey({ ...event, metaKey: false, ctrlKey: true }, false)
  ).toBe(true);
  for (const excluded of [
    { defaultPrevented: true },
    { isComposing: true },
    { repeat: true },
    { altKey: true },
    { shiftKey: true },
    { ctrlKey: true },
    { key: "j" },
  ]) {
    expect(consoleCommandKey({ ...event, ...excluded }, true)).toBe(false);
  }
});
