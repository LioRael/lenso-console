import { Select } from "@lenso/ui/select";
import { SettingsRow as LensoSettingsRow } from "@lenso/ui/settings-row";
import { Surface } from "@lenso/ui/surface";
import { useRef, type ComponentProps, type PropsWithChildren } from "react";

import {
  useConsoleLocale,
  type ConsoleLanguagePreference,
} from "../../app/console-locale";

import styles from "./settings-page.module.css";

export function SettingsPage() {
  const locale = useConsoleLocale();
  const zh = locale.locale === "zh-CN";

  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <h1>{zh ? "偏好设置" : "Preferences"}</h1>

        <SettingsSection title={zh ? "通用" : "General"}>
          <SettingsRow
            description={
              zh
                ? "更改 Console 导航和界面的语言。"
                : "Change the language used in Console navigation and controls."
            }
            title={zh ? "Console 语言" : "Console language"}
          >
            <PreferenceSelect
              aria-label={zh ? "Console 语言" : "Console language"}
              onValueChange={(value) =>
                locale.setPreference(value as ConsoleLanguagePreference)
              }
              options={[
                {
                  label: zh ? "跟随系统" : "System default",
                  value: "system",
                },
                { label: "English (US)", value: "en" },
                { label: "简体中文", value: "zh-CN" },
              ]}
              value={locale.preference}
            />
          </SettingsRow>
        </SettingsSection>
      </div>
    </main>
  );
}

function SettingsSection({
  children,
  title,
}: PropsWithChildren<{ title: string }>) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      <Surface className={styles.group} level="panel">
        {children}
      </Surface>
    </section>
  );
}

function SettingsRow({
  children,
  description,
  title,
  ...props
}: PropsWithChildren<
  Omit<ComponentProps<typeof LensoSettingsRow.Root>, "children"> & {
    description: string;
    title: string;
  }
>) {
  const rowRef = useRef<HTMLDivElement>(null);

  const getControl = () =>
    rowRef.current?.querySelector<HTMLElement>(
      '[data-slot="select-trigger"], [data-slot="switch"], button'
    );

  const setControlHover = (hovered: boolean) => {
    const control = getControl();
    if (!control || control.matches(":disabled, [data-disabled]")) {
      return;
    }
    if (hovered) {
      control.dataset.visualState = "hover";
    } else {
      delete control.dataset.visualState;
    }
  };

  return (
    <LensoSettingsRow.Root className={styles.row} ref={rowRef} {...props}>
      <LensoSettingsRow.Copy>
        <LensoSettingsRow.Title
          onClick={() => getControl()?.click()}
          onPointerEnter={() => setControlHover(true)}
          onPointerLeave={() => setControlHover(false)}
        >
          {title}
        </LensoSettingsRow.Title>
        <LensoSettingsRow.Description>
          {description}
        </LensoSettingsRow.Description>
      </LensoSettingsRow.Copy>
      <LensoSettingsRow.Control>{children}</LensoSettingsRow.Control>
    </LensoSettingsRow.Root>
  );
}

function PreferenceSelect({
  "aria-label": ariaLabel,
  disabled,
  onValueChange,
  options,
  value,
}: {
  "aria-label": string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <Select.Root
      disabled={disabled}
      onValueChange={(nextValue) => {
        if (typeof nextValue === "string") {
          onValueChange(nextValue);
        }
      }}
      value={value}
    >
      <Select.Trigger aria-label={ariaLabel} className={styles.selectTrigger}>
        <Select.Value>
          {options.find((option) => option.value === value)?.label ?? value}
        </Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="end" position="item-aligned">
          <Select.Popup>
            <Select.List>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  <Select.ItemText>{option.label}</Select.ItemText>
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
