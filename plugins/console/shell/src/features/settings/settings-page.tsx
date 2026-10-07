import { Select } from "@lenso/ui/select";
import * as stylex from "@stylexjs/stylex";
import { useRef, type ComponentProps, type PropsWithChildren } from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import {
  useConsoleLocale,
  type ConsoleLanguagePreference,
} from "../../app/console-locale";
import { SettingsRow as LensoSettingsRow } from "../../components/lenso/recipes/settings-row";
import { SettingsSection } from "../../components/lenso/recipes/settings-section";
import { ConsolePageHeader } from "../../components/runtime/console-page-header";
import { usePersistedLayout } from "../../hooks/use-persisted-layout";
import { settingsPageStyles as styles } from "./settings-page.stylex";

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
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.column)}>
        <ConsolePageHeader
          xstyle={styles.headerInset}
          title={zh ? "偏好设置" : "Preferences"}
          description={
            zh
              ? "管理 Console 的语言、时间和外观。"
              : "Manage language, time, and appearance in Console."
          }
        />

        <SettingsSection.Root
          aria-labelledby="general-settings-title"
          xstyle={styles.section}
        >
          <SettingsSection.Header>
            <SettingsSection.Title
              id="general-settings-title"
              xstyle={styles.sectionTitle}
            >
              {zh ? "通用" : "General"}
            </SettingsSection.Title>
          </SettingsSection.Header>
          <SettingsSection.Group xstyle={styles.group}>
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
                disabled={!locale.available || locale.saving}
                aria-label={zh ? "Console 语言" : "Console language"}
                onValueChange={(value) =>
                  void locale.setPreference(value as ConsoleLanguagePreference)
                }
                options={[
                  {
                    label: zh ? "跟随全局默认" : "Follow global default",
                    value: "global",
                  },
                  { label: "English (US)", value: "en" },
                  { label: "简体中文", value: "zh-CN" },
                ]}
                value={locale.preference}
              />
            </SettingsRow>
          </SettingsSection.Group>
        </SettingsSection.Root>

        {locale.error ? (
          <p role="alert">
            {zh ? "语言偏好暂不可用，请稍后重试。" : locale.error}
          </p>
        ) : null}
        {locale.canManageDefault ? (
          <SettingsSection.Root
            aria-labelledby="global-language-title"
            xstyle={[styles.section, styles.sectionFollowing]}
          >
            <SettingsSection.Header>
              <SettingsSection.Title
                id="global-language-title"
                xstyle={styles.sectionTitle}
              >
                {zh ? "Console 全局管理" : "Console administration"}
              </SettingsSection.Title>
            </SettingsSection.Header>
            <SettingsSection.Group xstyle={styles.group}>
              <SettingsRow
                title={zh ? "全局默认语言" : "Global default language"}
                description={
                  zh
                    ? "适用于选择跟随默认的用户和未登录页面。个人语言选择优先。"
                    : "Used by signed-out pages and accounts following the default. Personal choices take priority."
                }
              >
                <PreferenceSelect
                  aria-label={zh ? "全局默认语言" : "Global default language"}
                  disabled={!locale.available || locale.saving}
                  value={locale.globalDefault ?? "browser"}
                  options={[
                    {
                      label: zh ? "跟随浏览器" : "Browser language",
                      value: "browser",
                    },
                    { label: "English", value: "en" },
                    { label: "简体中文", value: "zh-CN" },
                  ]}
                  onValueChange={(value) => {
                    void locale.setGlobalDefault(
                      value === "browser" ? null : (value as "en" | "zh-CN")
                    );
                  }}
                />
              </SettingsRow>
            </SettingsSection.Group>
          </SettingsSection.Root>
        ) : null}
        <AppearanceSettings appearance={appearance} zh={zh} />
      </div>
    </main>
  );
}

function AppearanceSettings({
  appearance,
  zh,
}: {
  appearance: ReturnType<typeof useConsoleAppearance>;
  zh: boolean;
}) {
  return (
    <SettingsSection.Root
      aria-labelledby="appearance-settings-title"
      xstyle={[styles.section, styles.sectionFollowing]}
    >
      <SettingsSection.Header>
        <SettingsSection.Title
          id="appearance-settings-title"
          xstyle={styles.sectionTitle}
        >
          {zh ? "界面与主题" : "Interface and theme"}
        </SettingsSection.Title>
      </SettingsSection.Header>
      <SettingsSection.Group xstyle={styles.group}>
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
      </SettingsSection.Group>
    </SettingsSection.Root>
  );
}

function SettingsRow({
  children,
  description,
  disabled,
  title,
  xstyle,
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
    <LensoSettingsRow.Root
      ref={rowRef}
      {...props}
      {...(disabled === undefined ? {} : { disabled })}
      xstyle={[styles.row, disabled && styles.rowDisabled, xstyle]}
    >
      <LensoSettingsRow.Copy xstyle={styles.rowCopy}>
        <LensoSettingsRow.Title
          onClick={() => getControl()?.click()}
          onPointerEnter={() => setControlHover(true)}
          onPointerLeave={() => setControlHover(false)}
          xstyle={styles.rowTitle}
        >
          {title}
        </LensoSettingsRow.Title>
        <LensoSettingsRow.Description xstyle={styles.rowDescription}>
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
      <Select.Trigger aria-label={ariaLabel} xstyle={styles.selectTrigger}>
        <Select.Value>
          {options.find((option) => option.value === value)?.label ?? value}
        </Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="end" alignItemWithTrigger>
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
