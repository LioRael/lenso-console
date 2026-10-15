import { Popover, Select, ThemeScope } from "@lenso/ui";
import * as stylex from "@stylexjs/stylex";
import { Settings2, SlidersHorizontal } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ConsoleIconButton } from "./console-icon-button";
import { ConsoleLayout, type ConsoleCornerArea } from "./console-layout";
import { tableCornerSpacing } from "./console-layout.styles";
import { ConsoleTableFilterGroup } from "./console-table-filter-group";
import {
  ConsoleTableFilters,
  type ConsoleTableFiltersProps,
} from "./console-table-filters";
import { useConsoleTableHost } from "./console-table-host";
import {
  defaultConsoleTablePlacements,
  type ConsoleTableGroupKind,
  type ConsoleTablePlacement,
  type ConsoleTablePlacements,
} from "./console-table-model";

export type {
  ConsoleTableControls,
  ConsoleTableGroupKind,
  ConsoleTablePlacement,
  ConsoleTablePlacements,
} from "./console-table-model";

export interface ConsoleTableGroup {
  id: string;
  kind: ConsoleTableGroupKind;
  label: string;
  children: ReactNode;
  placement?: ConsoleTablePlacement;
}

export interface ConsoleTableContextProps {
  scopeKey: string;
  label: string;
  mode?: "page" | "embedded";
  groups: readonly ConsoleTableGroup[];
  filters?: ConsoleTableFiltersProps | undefined;
  /** Hold the current target during confirmation or asynchronous execution. */
  locked?: boolean;
  children: ReactNode;
}

const locations = [
  { value: "topLeft", label: "Top left" },
  { value: "topRight", label: "Top right" },
  { value: "bottomLeft", label: "Bottom left" },
  { value: "bottomRight", label: "Bottom right" },
  { value: "inline", label: "Beside content" },
];
const groupNames: Record<ConsoleTableGroupKind, string> = {
  query: "Search",
  filter: "Filters",
  insertion: "Create and import",
  view: "View",
  navigation: "Pagination",
  commit: "Save and cancel",
};

function Choice({
  label,
  value,
  items,
  change,
  disabled = false,
}: {
  label: string;
  value: string;
  items: readonly { value: string; label: string }[];
  change: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div {...stylex.props(styles.field)}>
      <Select.Root
        disabled={disabled}
        value={value}
        items={items}
        onValueChange={(next) => {
          if (next) {
            change(next);
          }
        }}
      >
        <Select.Label>{label}</Select.Label>
        <Select.Trigger id={id}>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <ThemeScope>
          <Select.Portal>
            <Select.Positioner>
              <Select.Popover>
                <Select.List>
                  {items.map((item) => (
                    <Select.Item key={item.value} value={item.value}>
                      <Select.ItemText>{item.label}</Select.ItemText>
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popover>
            </Select.Positioner>
          </Select.Portal>
        </ThemeScope>
      </Select.Root>
    </div>
  );
}

function projectTableGroups(
  groups: readonly ConsoleTableGroup[],
  placements: ConsoleTablePlacements
) {
  const floating = new Map<ConsoleCornerArea, ConsoleTableGroup[]>();
  const inline: ConsoleTableGroup[] = [];
  for (const group of groups) {
    const location =
      placements[group.kind] ??
      group.placement ??
      defaultConsoleTablePlacements[group.kind];
    if (location === "inline") {
      inline.push(group);
    } else {
      floating.set(location, [...(floating.get(location) ?? []), group]);
    }
  }
  return { floating, inline };
}

function CustomizationContents({
  groups,
  hasFilters,
  close,
}: {
  groups: readonly ConsoleTableGroup[];
  hasFilters: boolean;
  close: () => void;
}) {
  const host = useConsoleTableHost();
  const kinds = [
    ...new Set([
      ...groups.map((group) => group.kind),
      ...(hasFilters ? ["filter" as const] : []),
    ]),
  ];
  return (
    <>
      <Choice
        label="Control context"
        value={host.explicit ?? "automatic"}
        items={[
          { value: "automatic", label: "Automatic" },
          ...host.entries.map((entry) => ({
            value: entry.id,
            label: entry.label,
          })),
        ]}
        change={(value) => {
          host.choose(value === "automatic" ? null : value);
          close();
        }}
      />
      {kinds.map((kind) => (
        <Choice
          key={kind}
          disabled={!host.canPlace}
          label={`${groupNames[kind]} placement`}
          value={host.placements[kind] ?? defaultConsoleTablePlacements[kind]}
          items={locations}
          change={(value) => host.place(kind, value as ConsoleTablePlacement)}
        />
      ))}
    </>
  );
}

/** Page state stays mounted; only the active context projects controls into corners. */
export function ConsoleTableContext({
  scopeKey,
  label,
  mode = "page",
  groups,
  filters,
  locked = false,
  children,
}: ConsoleTableContextProps) {
  const host = useConsoleTableHost();
  const instance = useId();
  const id = `${instance}:${scopeKey}`;
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    setOpen(false);
  }, [id]);
  const lock = useRef(locked);
  useLayoutEffect(() => {
    lock.current = locked || open;
  }, [locked, open]);
  const { register } = host;
  useLayoutEffect(() => {
    if (!element) {
      return;
    }
    return register({ id, label, mode, element, locked: () => lock.current });
  }, [register, id, label, mode, element]);
  const active = host.active === id;
  const { floating, inline } = projectTableGroups(groups, host.placements);
  const renderGroup = (group: ConsoleTableGroup) => (
    <fieldset
      key={group.id}
      data-console-table-group={group.kind}
      aria-label={`${label}: ${group.label}`}
      {...stylex.props(styles.group)}
    >
      {group.children}
    </fieldset>
  );
  return (
    <section
      ref={setElement}
      aria-label={`${label} table context`}
      data-console-table-owner={id}
      {...stylex.props(
        mode === "page" && (groups.length > 0 || !!filters) && styles.page
      )}
    >
      {mode === "embedded" && (
        <ConsoleIconButton
          label={`Use table controls: ${label}`}
          variant="secondary"
          aria-pressed={active}
          onClick={() => host.choose(id)}
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
        </ConsoleIconButton>
      )}
      {inline.length > 0 && (
        <div {...stylex.props(styles.inline)}>
          {inline.map((group) => renderGroup(group))}
        </div>
      )}
      {filters && (
        <ConsoleTableFilters
          key={id}
          {...filters}
          renderGroup={(group) => (
            <ConsoleTableFilterGroup
              owner={id}
              active={active}
              placement={
                host.placements.filter ?? defaultConsoleTablePlacements.filter
              }
            >
              {group}
            </ConsoleTableFilterGroup>
          )}
        />
      )}
      {children}
      {active &&
        [...floating].map(([area, areaGroups]) => (
          <ConsoleLayout.Corner
            key={area}
            area={area}
            xstyle={[
              styles.corner,
              area.startsWith("top")
                ? tableCornerSpacing.top
                : tableCornerSpacing.bottom,
            ]}
          >
            <div data-console-table-owner={id} {...stylex.props(styles.area)}>
              {areaGroups.map(renderGroup)}
            </div>
          </ConsoleLayout.Corner>
        ))}
      {active && groups.length > 0 && host.customization && (
        <ConsoleLayout.Corner
          area="topRight"
          xstyle={[styles.corner, tableCornerSpacing.top]}
        >
          <div data-console-table-owner={id}>
            <Popover.Root open={open} onOpenChange={setOpen}>
              <Popover.Trigger
                render={
                  <ConsoleIconButton
                    label={`Table controls: ${label}`}
                    variant="secondary"
                  />
                }
              >
                <Settings2 size={18} aria-hidden="true" />
              </Popover.Trigger>
              <ThemeScope>
                <Popover.Portal>
                  <Popover.Positioner side="bottom" align="end" sideOffset={8}>
                    <Popover.Popup
                      aria-label="Table controls"
                      {...stylex.props(styles.preferences)}
                    >
                      <CustomizationContents
                        groups={groups}
                        hasFilters={!!filters}
                        close={() => setOpen(false)}
                      />
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </ThemeScope>
            </Popover.Root>
          </div>
        </ConsoleLayout.Corner>
      )}
    </section>
  );
}

const styles = stylex.create({
  page: {
    paddingBlockStart: { default: 8, "@media (max-width: 760px)": 72 },
    paddingBlockEnd: 96,
  },
  corner: { maxWidth: "100%", alignItems: "flex-start" },
  area: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    minWidth: 0,
    maxWidth: "100%",
  },
  group: {
    borderWidth: 0,
    padding: 0,
    margin: 0,
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
    maxWidth: "100%",
    backgroundColor: "var(--background)",
    borderRadius: 8,
  },
  inline: { display: "flex", flexWrap: "wrap", gap: 16, marginBlockEnd: 16 },
  field: { display: "grid", gap: 6, minWidth: 0 },
  preferences: {
    display: "grid",
    gap: 16,
    padding: 16,
    width: 280,
    maxWidth: "calc(100vw - 32px)",
  },
});
