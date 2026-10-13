// Keep scoped portals and ThemeScope in one entry point: split Vite prebundles
// otherwise create separate portal contexts and inherit the clipped Dock portal.
import { Menu, Select, ThemeScope } from "@lenso/ui";
import { Button } from "@lenso/ui/button";
import { Popover } from "@lenso/ui/popover";
import * as stylex from "@stylexjs/stylex";
import {
  Check,
  ChevronDown,
  GripVertical,
  LayoutGrid,
  Minus,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

import type { ConsolePreferences } from "./composition";
import {
  consoleDockPresets,
  updateConsoleDockPins,
  withConsoleDockPresets,
} from "./console-dock-presets";
import { ConsoleIconButton } from "./console-icon-button";
import {
  consolePositions,
  consoleReferenceKey,
  moveConsolePin,
  orderedConsolePins,
  type ConsoleNavigationItem,
} from "./console-model";
import { shellStyles as styles } from "./console-shell.styles";

export function ConsolePresetSwitcher({
  value,
  onSelect,
  disabled = false,
  compact = false,
}: {
  value: ConsolePreferences;
  onSelect: (id: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const document = consoleDockPresets(value);
  const labelId = useId();
  const active = document.presets.find(
    (preset) => preset.id === document.activeId
  )!;
  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button variant="ghost" />}
        xstyle={[styles.presetTrigger, compact && styles.compactPresetTrigger]}
        aria-label={`Dock preset: ${active.name}`}
        disabled={disabled}
      >
        {!compact && (
          <span {...stylex.props(styles.presetCaption)}>Preset</span>
        )}
        <span {...stylex.props(styles.presetName)}>{active.name}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </Menu.Trigger>
      <ThemeScope xstyle={styles.portalScope}>
        <Menu.Portal>
          <Menu.Positioner
            side="top"
            align="center"
            sideOffset={8}
            xstyle={styles.presetPositioner}
          >
            <Menu.Popup aria-labelledby={labelId} xstyle={styles.presetMenu}>
              <Menu.RadioGroup
                value={document.activeId}
                onValueChange={onSelect}
              >
                <Menu.GroupLabel id={labelId}>Dock presets</Menu.GroupLabel>
                {document.presets.map((preset) => (
                  <Menu.RadioItem
                    key={preset.id}
                    value={preset.id}
                    closeOnClick
                    xstyle={styles.presetOption}
                  >
                    <Menu.RadioItemIndicator keepMounted>
                      {preset.id === document.activeId && (
                        <Check size={16} aria-hidden="true" />
                      )}
                    </Menu.RadioItemIndicator>
                    <span {...stylex.props(styles.presetOptionName)}>
                      {preset.name}
                    </span>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </ThemeScope>
    </Menu.Root>
  );
}

function DestinationContent({ item }: { item: ConsoleNavigationItem }) {
  return (
    <>
      <span aria-hidden="true" {...stylex.props(styles.destinationIcon)}>
        {item.icon ?? <LayoutGrid size={20} />}
      </span>
      <span {...stylex.props(styles.destinationLabel)}>{item.label}</span>
    </>
  );
}

function DestinationPicker({
  value,
  items,
  suspended,
  onAdd,
  onClose,
}: {
  value: ConsolePreferences;
  items: readonly ConsoleNavigationItem[];
  suspended: boolean;
  onAdd: (item: ConsoleNavigationItem) => void;
  onClose: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const matches = items.filter((item) =>
    item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
  useLayoutEffect(() => {
    if (!suspended) {
      searchRef.current?.focus({ preventScroll: true });
    }
  }, [suspended]);
  return (
    <div {...stylex.props(styles.pickerBody)}>
      <div {...stylex.props(styles.trayHeader)}>
        <label {...stylex.props(styles.searchField)}>
          <Search size={18} aria-hidden="true" />
          <input
            ref={searchRef}
            aria-label="Search available destinations"
            placeholder="Find a destination to add"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            {...stylex.props(styles.search)}
          />
        </label>
        <ConsoleIconButton
          label="Close destination picker"
          variant="ghost"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </ConsoleIconButton>
      </div>
      <p {...stylex.props(styles.editHint)}>
        Choose a destination to add to this preset.
      </p>
      <ul {...stylex.props(styles.list, styles.directoryList)}>
        {matches.map((item) => {
          const present = value.pinned.some(
            (ref) => consoleReferenceKey(ref) === item.id
          );
          return (
            <li key={item.id}>
              <Button
                variant="ghost"
                xstyle={styles.directoryLink}
                disabled={present}
                aria-label={
                  present
                    ? `${item.label}, already in preset`
                    : `Add ${item.label} to preset`
                }
                onClick={() => onAdd(item)}
              >
                <DestinationContent item={item} />
                {present && (
                  <span {...stylex.props(styles.editHint)}>Added</span>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
      {!matches.length && (
        <p {...stylex.props(styles.empty)}>No matching destinations.</p>
      )}
    </div>
  );
}

type LiftedDestination = {
  item: ConsoleNavigationItem;
  x: number;
  y: number;
  width: number;
  height: number;
};

function DragOverlay({ lift }: { lift: LiftedDestination | null }) {
  return (
    <ThemeScope xstyle={styles.portalScope}>
      <Popover.Portal>
        {lift && (
          <div
            aria-hidden="true"
            data-console-drag-overlay
            {...stylex.props(styles.dragOverlay)}
            style={{
              transform: `translate3d(${lift.x}px, ${lift.y}px, 0)`,
              width: lift.width,
              height: lift.height,
            }}
          >
            <div
              {...stylex.props(
                styles.link,
                styles.directoryLink,
                styles.editDestination
              )}
            >
              <DestinationContent item={lift.item} />
            </div>
          </div>
        )}
      </Popover.Portal>
    </ThemeScope>
  );
}

function PresetGrip({
  item,
  previous,
  next,
  onMove,
  onPointerDown,
}: {
  item: ConsoleNavigationItem;
  previous: ConsoleNavigationItem | undefined;
  next: ConsoleNavigationItem | undefined;
  onMove: (targetId: string) => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <ConsoleIconButton
      label={`Drag ${item.label}`}
      tooltip={`Drag ${item.label} to reorder, or use arrow keys`}
      variant="ghost"
      xstyle={styles.dragHandle}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        const target =
          event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? previous
            : event.key === "ArrowRight" || event.key === "ArrowDown"
              ? next
              : undefined;
        if (target) {
          event.preventDefault();
          onMove(target.id);
        }
      }}
    >
      <GripVertical size={16} aria-hidden="true" />
    </ConsoleIconButton>
  );
}

/** Visible editing never replaces the stored collection with its permission projection. */
export function ConsolePresetCollection({
  value,
  items,
  busy,
  suspended,
  onChange,
  announce,
}: {
  value: ConsolePreferences;
  items: readonly ConsoleNavigationItem[];
  busy: boolean;
  suspended: boolean;
  onChange: (value: ConsolePreferences) => void;
  announce: (message: string) => void;
}) {
  const reduced = useReducedMotion();
  const pins = orderedConsolePins(items, value);
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const focusId = useRef<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [lift, setLift] = useState<LiftedDestination | null>(null);
  const gesture = useRef<{
    pointerId: number;
    id: string;
    before: ConsolePreferences;
    offsetX: number;
    offsetY: number;
    lastTarget: string | null;
  } | null>(null);
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);
  const finish = useCallback(
    (cancel: boolean) => {
      const { current } = gesture;
      gesture.current = null;
      setLift(null);
      if (current && cancel) {
        onChange(current.before);
        announce("Reorder cancelled.");
      }
    },
    [onChange, announce]
  );
  useLayoutEffect(() => {
    if (suspended || busy) {
      finish(true);
    }
  }, [suspended, busy, finish]);
  useLayoutEffect(() => {
    if (focusId.current) {
      if (focusId.current === "add") {
        addRef.current?.focus({ preventScroll: true });
        focusId.current = null;
        return;
      }
      const tile = Array.from(listRef.current?.children ?? []).find(
        (node) =>
          (node as HTMLElement).dataset.consoleEditItem === focusId.current
      );
      tile
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
      focusId.current = null;
    }
  });
  const closePicker = () => {
    setAdding(false);
    focusId.current = "add";
  };
  const move = (id: string, target: string, fromKeyboard = false) => {
    const { current } = latest;
    const from = current.pinned.findIndex(
      (ref) => consoleReferenceKey(ref) === id
    );
    const to = current.pinned.findIndex(
      (ref) => consoleReferenceKey(ref) === target
    );
    if (from === -1 || to === -1 || from === to) {
      return;
    }
    const next = updateConsoleDockPins(
      current,
      moveConsolePin(current.pinned, from, to)
    );
    latest.current = next;
    onChange(next);
    if (fromKeyboard) {
      focusId.current = id;
    }
    const position =
      orderedConsolePins(items, next).findIndex((item) => item.id === id) + 1;
    announce(
      `${items.find((item) => item.id === id)?.label} moved to position ${position}.`
    );
  };
  return (
    <section
      inert={busy}
      aria-label={adding ? "Add destinations" : "Preset destinations"}
      onPointerMove={(event) => {
        const { current } = gesture;
        if (!current || current.pointerId !== event.pointerId) {
          return;
        }
        setLift(
          (previous) =>
            previous && {
              ...previous,
              x: event.clientX - current.offsetX,
              y: event.clientY - current.offsetY,
            }
        );
        // Hit testing uses layout slots, not the moving sibling's visual bounds.
        const list = listRef.current!;
        const rect = list.getBoundingClientRect();
        const target = Array.from(
          list.querySelectorAll<HTMLElement>("[data-console-edit-item]")
        ).find((tile) => {
          const x = rect.x + tile.offsetLeft;
          const y = rect.y + tile.offsetTop;
          return (
            event.clientX >= x &&
            event.clientX <= x + tile.offsetWidth &&
            event.clientY >= y &&
            event.clientY <= y + tile.offsetHeight
          );
        });
        const id = target?.dataset.consoleEditItem;
        if (id && id !== current.id && id !== current.lastTarget) {
          current.lastTarget = id;
          move(current.id, id);
        } else if (id === current.id) {
          current.lastTarget = null;
        }
      }}
      onPointerUp={() => finish(false)}
      onPointerCancel={() => finish(true)}
      onLostPointerCapture={(event) => {
        if (event.target === listRef.current && gesture.current) {
          finish(true);
        }
      }}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" && (gesture.current || adding)) {
          event.preventDefault();
          event.stopPropagation();
          if (gesture.current) {
            finish(true);
          } else {
            closePicker();
          }
        }
      }}
    >
      {adding ? (
        <DestinationPicker
          value={value}
          items={items}
          suspended={suspended}
          onClose={closePicker}
          onAdd={(item) => {
            onChange(
              updateConsoleDockPins(value, [...value.pinned, item.reference])
            );
            announce(`${item.label} added to this preset.`);
            closePicker();
          }}
        />
      ) : (
        <>
          {!pins.length && (
            <p {...stylex.props(styles.editHint)}>
              This preset is empty. Add the destinations you want in your Dock.
            </p>
          )}
          <ul
            ref={listRef}
            inert={busy}
            {...stylex.props(
              styles.list,
              styles.directoryList,
              styles.editGrid
            )}
          >
            {pins.map((item, index) => (
              <motion.li
                key={item.id}
                layout={!reduced && !keyboard ? "position" : false}
                transition={{
                  layout: { duration: 0.2, ease: [0.23, 1, 0.32, 1] },
                }}
                data-console-launcher-item={item.id}
                data-console-edit-item={item.id}
                {...stylex.props(
                  styles.launcherTile,
                  styles.editingTile,
                  lift?.item.id === item.id && styles.dragPlaceholder
                )}
              >
                <div
                  {...stylex.props(
                    styles.link,
                    styles.directoryLink,
                    styles.editDestination
                  )}
                >
                  <DestinationContent item={item} />
                </div>
                <div {...stylex.props(styles.editTools)}>
                  <PresetGrip
                    item={item}
                    previous={pins[index - 1]}
                    next={pins[index + 1]}
                    onMove={(targetId) => {
                      setKeyboard(true);
                      move(item.id, targetId, true);
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || !event.isPrimary) {
                        return;
                      }
                      setKeyboard(false);
                      const rect = event.currentTarget
                        .closest("li")!
                        .getBoundingClientRect();
                      gesture.current = {
                        pointerId: event.pointerId,
                        id: item.id,
                        before: value,
                        offsetX: event.clientX - rect.x,
                        offsetY: event.clientY - rect.y,
                        lastTarget: null,
                      };
                      // A grip's node moves during insertion, which loses native capture.
                      // The collection remains stable for the whole gesture.
                      listRef.current!.setPointerCapture(event.pointerId);
                      event.currentTarget.focus({ preventScroll: true });
                      event.preventDefault();
                      setLift({
                        item,
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                      });
                    }}
                  />
                  <ConsoleIconButton
                    label={`Remove ${item.label} from preset`}
                    variant="ghost"
                    xstyle={styles.removePin}
                    onClick={() => {
                      focusId.current =
                        pins[index + 1]?.id ?? pins[index - 1]?.id ?? null;
                      onChange(
                        updateConsoleDockPins(
                          value,
                          value.pinned.filter(
                            (ref) => consoleReferenceKey(ref) !== item.id
                          )
                        )
                      );
                      if (!focusId.current) {
                        addRef.current?.focus({ preventScroll: true });
                      }
                      announce(
                        `${item.label} removed from this preset. It remains in All destinations.`
                      );
                    }}
                  >
                    <Minus size={16} aria-hidden="true" />
                  </ConsoleIconButton>
                </div>
              </motion.li>
            ))}
            <li>
              <Button
                ref={addRef}
                variant="ghost"
                xstyle={[styles.directoryLink, styles.addDestination]}
                aria-label="Add destinations"
                onClick={() => setAdding(true)}
              >
                <Plus size={24} aria-hidden="true" />
                <span>Add destinations</span>
              </Button>
            </li>
          </ul>
        </>
      )}
      <DragOverlay lift={suspended ? null : lift} />
    </section>
  );
}

export function ConsoleNavigationEditor({
  value,
  busy,
  loaded,
  error,
  presentation = false,
  onChange,
  onSave,
  onCancel,
  onReload,
  children,
}: {
  value: ConsolePreferences;
  busy: boolean;
  loaded: boolean;
  error: string | null;
  presentation?: boolean;
  onChange: (value: ConsolePreferences) => void;
  onSave: () => void;
  onCancel: () => void;
  onReload: () => void;
  children?: ReactNode;
}) {
  const document = consoleDockPresets(value);
  const active = document.presets.find(
    (preset) => preset.id === document.activeId
  )!;
  const [naming, setNaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  useLayoutEffect(() => {
    if (naming) {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [naming, active.id]);
  return (
    <>
      <div {...stylex.props(styles.trayHeader)}>
        <h2 {...stylex.props(styles.traySettingsTitle)}>
          {presentation ? "Navigation settings" : `Edit ${active.name}`}
        </h2>
        <Button
          variant="ghost"
          xstyle={styles.editorAction}
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          xstyle={[styles.editorAction, styles.editorSave]}
          disabled={
            busy ||
            !loaded ||
            document.presets.some((preset) => !preset.name.trim())
          }
          onClick={onSave}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && (
        <div {...stylex.props(styles.controls)}>
          <p role="alert" {...stylex.props(styles.editHint)}>
            {error}
          </p>
          <Button
            variant="outline"
            xstyle={styles.editorAction}
            disabled={busy}
            onClick={onReload}
          >
            Discard draft and reload
          </Button>
        </div>
      )}
      {presentation ? (
        <div {...stylex.props(styles.presentationControls)} inert={busy}>
          <div {...stylex.props(styles.presetField)}>
            <Select.Root
              value={value.mode}
              onValueChange={(mode) =>
                onChange({
                  ...value,
                  mode: mode === "sidebar" ? "sidebar" : "dock",
                })
              }
            >
              <Select.Label>Navigation mode</Select.Label>
              <Select.Trigger fullWidth xstyle={styles.selectTrigger}>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <ThemeScope xstyle={styles.portalScope}>
                <Select.Portal>
                  <Select.Positioner
                    sideOffset={8}
                    xstyle={styles.presetPositioner}
                  >
                    <Select.Popup xstyle={styles.selectPopup}>
                      <Select.List>
                        <Select.Item value="dock">
                          <Select.ItemText>Dock</Select.ItemText>
                          <Select.ItemIndicator />
                        </Select.Item>
                        <Select.Item value="sidebar">
                          <Select.ItemText>Sidebar</Select.ItemText>
                          <Select.ItemIndicator />
                        </Select.Item>
                      </Select.List>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </ThemeScope>
            </Select.Root>
          </div>
          <div {...stylex.props(styles.presetField)}>
            <Select.Root
              value={value.position}
              onValueChange={(selected) => {
                const position = consolePositions.find(
                  (candidate) => candidate === selected
                );
                if (position) {
                  onChange({ ...value, position });
                }
              }}
            >
              <Select.Label>Dock position</Select.Label>
              <Select.Trigger fullWidth xstyle={styles.selectTrigger}>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <ThemeScope xstyle={styles.portalScope}>
                <Select.Portal>
                  <Select.Positioner
                    sideOffset={8}
                    xstyle={styles.presetPositioner}
                  >
                    <Select.Popup xstyle={styles.selectPopup}>
                      <Select.List>
                        {consolePositions.map((position) => (
                          <Select.Item key={position} value={position}>
                            <Select.ItemText>{position}</Select.ItemText>
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.List>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </ThemeScope>
            </Select.Root>
          </div>
        </div>
      ) : (
        <>
          <div {...stylex.props(styles.presetEditorRow)} inert={busy}>
            <ConsolePresetSwitcher
              value={value}
              disabled={document.presets.some((preset) => !preset.name.trim())}
              onSelect={(id) => {
                onChange(withConsoleDockPresets(value, document.presets, id));
                setNaming(false);
                setDeleting(false);
              }}
            />
            <Menu.Root>
              <Menu.Trigger
                render={
                  <ConsoleIconButton label="Preset actions" variant="ghost">
                    <MoreHorizontal size={18} />
                  </ConsoleIconButton>
                }
              />
              <ThemeScope xstyle={styles.portalScope}>
                <Menu.Portal>
                  <Menu.Positioner
                    align="end"
                    sideOffset={8}
                    xstyle={styles.presetPositioner}
                  >
                    <Menu.Popup
                      aria-label="Preset actions"
                      xstyle={styles.presetMenu}
                    >
                      <Menu.Item
                        xstyle={styles.presetOption}
                        onClick={() => setNaming(true)}
                      >
                        Rename preset
                      </Menu.Item>
                      <Menu.Item
                        xstyle={styles.presetOption}
                        disabled={
                          document.presets.length >= 50 ||
                          document.presets.some((preset) => !preset.name.trim())
                        }
                        onClick={() => {
                          const id = crypto.randomUUID();
                          onChange(
                            withConsoleDockPresets(
                              value,
                              [
                                ...document.presets,
                                { id, name: "Untitled preset", pinned: [] },
                              ],
                              id
                            )
                          );
                          setNaming(true);
                          setDeleting(false);
                        }}
                      >
                        New preset
                      </Menu.Item>
                      <Menu.Item
                        xstyle={styles.presetOption}
                        disabled={document.presets.length === 1}
                        onClick={() => setDeleting(true)}
                      >
                        Delete preset
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </ThemeScope>
            </Menu.Root>
          </div>
          {naming && (
            <label {...stylex.props(styles.presetField)}>
              Preset name
              <input
                ref={nameRef}
                disabled={busy}
                {...stylex.props(styles.field)}
                value={active.name}
                maxLength={80}
                required
                aria-invalid={!active.name.trim()}
                aria-describedby={active.name.trim() ? undefined : errorId}
                onChange={(event) =>
                  onChange(
                    withConsoleDockPresets(
                      value,
                      document.presets.map((preset) =>
                        preset.id === active.id
                          ? { ...preset, name: event.target.value }
                          : preset
                      ),
                      active.id
                    )
                  )
                }
              />
            </label>
          )}
          {!active.name.trim() && (
            <p id={errorId} role="alert" {...stylex.props(styles.editHint)}>
              Enter a preset name before saving.
            </p>
          )}
          {deleting && (
            <div {...stylex.props(styles.controls)}>
              <p {...stylex.props(styles.editHint)}>
                Delete {active.name}? Destinations and their data are unchanged.
                Save to confirm your changes.
              </p>
              <Button
                variant="outline"
                xstyle={styles.editorAction}
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                Keep preset
              </Button>
              <Button
                disabled={busy}
                xstyle={[styles.editorAction, styles.editorSave]}
                onClick={() => {
                  const remaining = document.presets.filter(
                    (preset) => preset.id !== active.id
                  );
                  onChange(
                    withConsoleDockPresets(value, remaining, remaining[0]!.id)
                  );
                  setDeleting(false);
                  setNaming(false);
                }}
              >
                Confirm delete preset
              </Button>
            </div>
          )}
          <p {...stylex.props(styles.editHint)}>
            Drag grips or use arrow keys to reorder. Save applies to every
            edited preset.
          </p>
          {children}
        </>
      )}
    </>
  );
}
