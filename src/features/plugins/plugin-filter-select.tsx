import { Select } from "@lenso/ui/select";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  popup: {
    height: "auto",
    maxHeight: "var(--available-height)",
    overflowY: "auto",
  },
  trigger: {
    minWidth: 0,
    maxWidth: "100%",
    height: 30,
    fontSize: 12,
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--color-surface-interactive-hover)",
    },
    borderColor: "transparent",
    boxShadow: "none",
    paddingInline: 8,
  },
  value: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});

export function PluginFilterSelect<Value extends string>({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onValueChange: (value: Value) => void;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        const option = options.find((item) => item.value === next);
        if (option) {
          onValueChange(option.value);
        }
      }}
    >
      <Select.Trigger aria-label={label} xstyle={styles.trigger}>
        <Select.Value xstyle={styles.value}>
          {options.find((item) => item.value === value)?.label}
        </Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner position="popper" align="start">
          <Select.Popup xstyle={styles.popup}>
            <Select.List>
              {options.map((item) => (
                <Select.Item key={item.value} value={item.value}>
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
