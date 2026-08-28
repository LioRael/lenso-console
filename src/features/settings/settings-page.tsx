import {
  useConsoleLocale,
  type ConsoleLanguagePreference,
} from "@lenso/console-ui";
import { Select } from "@lenso/ui/select";
import { SettingsRow as LensoSettingsRow } from "@lenso/ui/settings-row";
import { Surface } from "@lenso/ui/surface";
import { useRef, type ComponentProps, type PropsWithChildren } from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import { embeddedOfficialDefaultThemeBundle } from "../../app/console-theme-bundle";
import { usePersistedLayout } from "../../hooks/use-persisted-layout";

import styles from "./settings-page.module.css";

type GeneralSettings = {
  timeZone: string;
};

const defaultGeneralSettings: GeneralSettings = {
  timeZone: "Asia/Shanghai",
};

const timeZones = [
  { label: "Asia / Shanghai", value: "Asia/Shanghai" },
  { label: "Asia / Tokyo", value: "Asia/Tokyo" },
  { label: "Europe / London", value: "Europe/London" },
  { label: "America / Los Angeles", value: "America/Los_Angeles" },
] as const;

export function SettingsPage() {
  const appearance = useConsoleAppearance();
  const locale = useConsoleLocale();
  const zh = locale.locale === "zh-CN";
  const [general, setGeneral] = usePersistedLayout(
    "lenso-console-general-preferences-v1",
    defaultGeneralSettings
  );

  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <h1>{zh ? "偏好设置" : "Preferences"}</h1>

        <SettingsSection title={zh ? "通用" : "General"}>
          <SettingsRow
            description={
              zh
                ? "Console 中日期和时间的显示时区。"
                : "Time zone used for dates and times in Console."
            }
            title={zh ? "时区" : "Time zone"}
          >
            <PreferenceSelect
              aria-label={zh ? "时区" : "Time zone"}
              onValueChange={(value) =>
                setGeneral((current) => ({ ...current, timeZone: value }))
              }
              options={timeZones}
              value={general.timeZone}
            />
          </SettingsRow>
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

        <AppearanceSettings appearance={appearance} zh={zh} />
      </div>
    </main>
  );
}

function reloadThemeSelection() {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

function AppearanceSettings({
  appearance,
  zh,
}: {
  appearance: ReturnType<typeof useConsoleAppearance>;
  zh: boolean;
}) {
  const selectedBundle = appearance.themeBundles.find(
    (candidate) => candidate.bundleId === appearance.bundleId
  );
  const defaultBundleId = embeddedOfficialDefaultThemeBundle.manifest.bundleId;

  return (
    <SettingsSection title={zh ? "界面与主题" : "Interface and theme"}>
      <SettingsRow
        description={
          zh
            ? "使用系统外观，或始终使用浅色或深色模式。"
            : "Use your system appearance, or always use light or dark mode."
        }
        title={zh ? "颜色模式" : "Color mode"}
      >
        <PreferenceSelect
          aria-label={zh ? "颜色模式" : "Color mode"}
          onValueChange={(value) =>
            appearance.setPreference(value as "system" | "light" | "dark")
          }
          options={[
            { label: zh ? "跟随系统" : "System", value: "system" },
            { label: zh ? "浅色" : "Light", value: "light" },
            { label: zh ? "深色" : "Dark", value: "dark" },
          ]}
          value={appearance.preference}
        />
      </SettingsRow>
      <SettingsRow
        description={
          zh
            ? "Console 当前使用的展示主题包。"
            : "Presentation theme package used by Console."
        }
        title={zh ? "主题包" : "Theme bundle"}
      >
        <PreferenceSelect
          aria-label={zh ? "主题包" : "Theme bundle"}
          onValueChange={(value) => {
            if (value === defaultBundleId) {
              appearance.recoverToOfficialDefault();
            } else {
              appearance.setBundleId(value);
              appearance.setVariantId(null);
            }
            reloadThemeSelection();
          }}
          options={[
            {
              label: zh ? "默认 Console" : "Default Console",
              value: defaultBundleId,
            },
            ...appearance.themeBundles.map((bundle) => ({
              label: bundle.manifest.displayName,
              value: bundle.bundleId,
            })),
          ]}
          value={appearance.bundleId ?? defaultBundleId}
        />
      </SettingsRow>
      <SettingsRow
        description={
          zh
            ? "所选主题包提供的外观变体。"
            : "Appearance variant exposed by the selected theme package."
        }
        disabled={
          !selectedBundle || selectedBundle.manifest.variants.length < 2
        }
        title={zh ? "主题变体" : "Theme variant"}
      >
        <PreferenceSelect
          aria-label={zh ? "主题变体" : "Theme variant"}
          disabled={
            !selectedBundle || selectedBundle.manifest.variants.length < 2
          }
          onValueChange={(value) => {
            appearance.setVariantId(value);
            reloadThemeSelection();
          }}
          options={
            selectedBundle
              ? selectedBundle.manifest.variants.map((variant) => ({
                  label: variant.label,
                  value: variant.id,
                }))
              : [
                  {
                    label: zh ? "自动（系统）" : "Automatic (System)",
                    value: "automatic",
                  },
                ]
          }
          value={
            selectedBundle
              ? (appearance.variantId ?? selectedBundle.manifest.defaultVariant)
              : "automatic"
          }
        />
      </SettingsRow>
    </SettingsSection>
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
