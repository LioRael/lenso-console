import { Select } from "@lenso/ui/select";
import * as stylex from "@stylexjs/stylex";

import { pluginScopes, useAppManagement } from "../apps/app-management-context";

const styles = stylex.create({
  context: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
  label: { fontSize: 12, color: "var(--color-content-tertiary)" },
  trigger: { maxWidth: 280, minWidth: 0, height: 32, fontSize: 12 },
  value: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  popup: {
    height: "auto",
    minWidth: 260,
    maxHeight: "var(--available-height)",
    overflowY: "auto",
  },
});

export function PluginTargetSelect() {
  const { apps, selectedApp, selectApp } = useAppManagement();
  return (
    <div {...stylex.props(styles.context)}>
      <span {...stylex.props(styles.label)}>Manage</span>
      <Select.Root
        value={selectedApp?.id ?? ""}
        onValueChange={(value) => {
          if (value) {
            selectApp(value);
          }
        }}
      >
        <Select.Trigger aria-label="Manage App" xstyle={styles.trigger}>
          <Select.Value xstyle={styles.value}>
            {selectedApp?.label ?? "Select an App"}
          </Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner position="popper" align="start">
            <Select.Popup xstyle={styles.popup}>
              <Select.List>
                {pluginScopes.map((scope) => {
                  const targets = apps.filter((app) => app.scope === scope.id);
                  return targets.length ? (
                    <Select.Group key={scope.id}>
                      <Select.GroupLabel>{scope.label}</Select.GroupLabel>
                      {targets.map((app) => (
                        <Select.Item key={app.id} value={app.id}>
                          <Select.ItemText>{app.label}</Select.ItemText>
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Group>
                  ) : null;
                })}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
