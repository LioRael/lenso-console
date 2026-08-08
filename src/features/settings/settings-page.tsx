import {
  Button,
  Input,
  Select,
  SettingsRow,
  settingsStyles,
  useConsoleLocale,
  type ConsoleLanguagePreference,
} from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

import { useConsoleAppearance } from "../../app/console-appearance";
import { embeddedOfficialDefaultThemeBundle } from "../../app/console-theme-bundle";
import { usePersistedLayout } from "../../hooks/use-persisted-layout";
import { ProductPage } from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

type GeneralSettings = {
  agentDrafts: boolean;
  environment: string;
  experimentalSurfaces: boolean;
  manualApprovalReason: boolean;
  refreshInterval: string;
  timeZone: string;
  workspaceName: string;
  workspaceSlug: string;
};

const defaultGeneralSettings: GeneralSettings = {
  agentDrafts: true,
  environment: "production",
  experimentalSurfaces: false,
  manualApprovalReason: true,
  refreshInterval: "15",
  timeZone: "Asia/Shanghai",
  workspaceName: "Leo's team",
  workspaceSlug: "leos-team",
};

export function SettingsPage() {
  const appearance = useConsoleAppearance();
  const locale = useConsoleLocale();
  const copy = consoleProductCopy(locale.locale);
  const zh = locale.locale === "zh-CN";
  const [storedSettings, setStoredSettings] = usePersistedLayout(
    "lenso-console-general-settings",
    defaultGeneralSettings
  );
  const [draft, setDraft] = useState(storedSettings);
  const [saved, setSaved] = useState(false);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(storedSettings);

  const update = <Key extends keyof GeneralSettings>(
    key: Key,
    value: GeneralSettings[Key]
  ) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <ProductPage
      description={copy.settings.description}
      pageKind="settings-product-page"
      title={copy.settings.title}
    >
      <div data-page-slot="settings-page">
        <SettingsNavigation zh={zh} />
        <div data-page-slot="settings-page__content">
          <header data-page-slot="settings-page__header">
            <div data-page-slot="settings-page__header-copy">
              <h2>{zh ? "通用" : "General"}</h2>
              <p>
                {zh
                  ? "当前 Console 工作区的身份与默认设置。"
                  : "Identity and defaults for this Console workspace."}
              </p>
            </div>
          </header>

          {appearance.themeBundles.length > 0 ? (
            <>
              <SettingsRow
                data-page-slot="settings-page__row"
                description={
                  zh
                    ? "主题包由 Console 管理员安装；操作员可以随时切换。"
                    : "Theme Bundles are installed by Console administrators and can be switched by operators."
                }
                label={zh ? "主题包" : "Theme Bundle"}
              >
                <Select
                  aria-label={zh ? "主题包" : "Theme Bundle"}
                  value={
                    appearance.bundleId ??
                    embeddedOfficialDefaultThemeBundle.manifest.bundleId
                  }
                  onChange={(event) => {
                    if (
                      event.target.value ===
                      embeddedOfficialDefaultThemeBundle.manifest.bundleId
                    ) {
                      appearance.recoverToOfficialDefault();
                    } else {
                      appearance.setBundleId(event.target.value || null);
                      appearance.setVariantId(null);
                    }
                    reloadThemeSelection();
                  }}
                >
                  <option
                    value={embeddedOfficialDefaultThemeBundle.manifest.bundleId}
                  >
                    {zh ? "Lenso 官方默认" : "Lenso Official Default"}
                  </option>
                  {appearance.themeBundles.map((bundle) => (
                    <option key={bundle.bundleId} value={bundle.bundleId}>
                      {bundle.manifest.displayName} ({bundle.bundleId})
                    </option>
                  ))}
                </Select>
              </SettingsRow>
              {(() => {
                const bundle = appearance.themeBundles.find(
                  (candidate) => candidate.bundleId === appearance.bundleId
                );
                if (!bundle || bundle.manifest.variants.length < 2) {
                  return null;
                }
                return (
                  <SettingsRow
                    data-page-slot="settings-page__row"
                    description={
                      zh
                        ? "主题包可以提供深色、浅色或自定义变体。"
                        : "A Theme Bundle may provide dark, light, or custom variants."
                    }
                    label={zh ? "主题变体" : "Theme Variant"}
                  >
                    <Select
                      aria-label={zh ? "主题变体" : "Theme Variant"}
                      value={
                        appearance.variantId ?? bundle.manifest.defaultVariant
                      }
                      onChange={(event) => {
                        appearance.setVariantId(event.target.value);
                        reloadThemeSelection();
                      }}
                    >
                      {bundle.manifest.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.label}
                        </option>
                      ))}
                    </Select>
                  </SettingsRow>
                );
              })()}
            </>
          ) : null}

          <SettingsRow
            data-page-slot="settings-page__row"
            description={
              zh
                ? "显示给操作员，并写入导出的证据。"
                : "Shown to operators and in exported evidence."
            }
            label={zh ? "工作区名称" : "Workspace name"}
          >
            <Input
              aria-label={zh ? "工作区名称" : "Workspace name"}
              data-page-slot="settings-page__input"
              onChange={(event) => update("workspaceName", event.target.value)}
              value={draft.workspaceName}
            />
          </SettingsRow>
          <SettingsRow
            data-page-slot="settings-page__row"
            description={
              zh
                ? "API 客户端使用的稳定标识符。"
                : "Stable identifier used by API clients."
            }
            label={zh ? "工作区标识" : "Workspace slug"}
          >
            <Input
              aria-label={zh ? "工作区标识" : "Workspace slug"}
              data-page-slot="settings-page__input settings-page__input--mono"
              onChange={(event) => update("workspaceSlug", event.target.value)}
              value={draft.workspaceSlug}
            />
          </SettingsRow>
          <SettingsRow
            data-page-slot="settings-page__row"
            description={
              zh
                ? "运营视图的初始环境。"
                : "Initial context for operational views."
            }
            label={zh ? "默认环境" : "Default environment"}
          >
            <SettingsSelect
              label={zh ? "默认环境" : "Default environment"}
              onChange={(value) => update("environment", value)}
              value={draft.environment}
            >
              <option value="production">
                {zh ? "生产环境" : "Production"}
              </option>
              <option value="staging">{zh ? "预发布环境" : "Staging"}</option>
            </SettingsSelect>
          </SettingsRow>
          <SettingsRow
            data-page-slot="settings-page__row"
            description={
              zh
                ? "用于时间线显示与证据导出。"
                : "Used for timeline display and evidence exports."
            }
            label={copy.settings.timeZone}
          >
            <SettingsSelect
              label={copy.settings.timeZone}
              onChange={(value) => update("timeZone", value)}
              value={draft.timeZone}
            >
              <option value="Asia/Shanghai">Asia / Shanghai</option>
              <option value="Asia/Tokyo">Asia / Tokyo</option>
              <option value="Europe/London">Europe / London</option>
              <option value="America/Los_Angeles">America / Los Angeles</option>
            </SettingsSelect>
          </SettingsRow>
          <SettingsRow
            data-page-slot="settings-page__row"
            description={copy.settings.languageDescription}
            label={copy.settings.consoleLanguage}
          >
            <Select
              aria-label={copy.settings.consoleLanguage}
              data-page-slot="settings-page__select"
              onChange={(event) =>
                locale.setPreference(
                  event.target.value as ConsoleLanguagePreference
                )
              }
              value={locale.preference}
            >
              <option value="system">{copy.settings.followSystem}</option>
              <option value="en">English (US)</option>
              <option value="zh-CN">简体中文</option>
            </Select>
          </SettingsRow>
          <SettingsRow
            data-page-slot="settings-page__row"
            description={
              zh
                ? "流式更新不可用时的轮询间隔。"
                : "Live polling interval when streaming is unavailable."
            }
            label={zh ? "运行时刷新" : "Runtime refresh"}
          >
            <SettingsSelect
              label={zh ? "运行时刷新" : "Runtime refresh"}
              onChange={(value) => update("refreshInterval", value)}
              value={draft.refreshInterval}
            >
              <option value="5">{zh ? "5 秒" : "5 seconds"}</option>
              <option value="15">{zh ? "15 秒" : "15 seconds"}</option>
              <option value="30">{zh ? "30 秒" : "30 seconds"}</option>
            </SettingsSelect>
          </SettingsRow>
          <SettingsRow
            data-page-slot="settings-page__row settings-page__row--toggle"
            description={
              zh
                ? "操作员必须在审批前记录简明理由。"
                : "Operators must record a concise rationale before approval."
            }
            label={
              zh ? "手动审批必须填写理由" : "Require reason for manual approval"
            }
          >
            <SettingsToggle
              label={
                zh
                  ? "手动审批必须填写理由"
                  : "Require reason for manual approval"
              }
              onChange={(value) => update("manualApprovalReason", value)}
              value={draft.manualApprovalReason}
            />
          </SettingsRow>
          <SettingsRow
            data-page-slot="settings-page__row settings-page__row--toggle"
            description={
              zh
                ? "Agent 可以准备有边界的草稿，但不能批准。"
                : "Agents may prepare bounded drafts; they cannot approve them."
            }
            label={
              zh
                ? "允许 Agent 编写计划草稿"
                : "Allow agent-authored draft plans"
            }
          >
            <SettingsToggle
              label={
                zh
                  ? "允许 Agent 编写计划草稿"
                  : "Allow agent-authored draft plans"
              }
              onChange={(value) => update("agentDrafts", value)}
              value={draft.agentDrafts}
            />
          </SettingsRow>
          <SettingsRow
            data-page-slot="settings-page__row settings-page__row--toggle"
            description={
              zh
                ? "显示标记为实验性的 Console 页面。"
                : "Expose Console surfaces marked experimental."
            }
            label={zh ? "显示实验性页面" : "Show experimental surfaces"}
          >
            <SettingsToggle
              label={zh ? "显示实验性页面" : "Show experimental surfaces"}
              onChange={(value) => update("experimentalSurfaces", value)}
              value={draft.experimentalSurfaces}
            />
          </SettingsRow>
          <div data-page-slot="settings-page__actions">
            <span aria-live="polite" data-page-slot="settings-page__status">
              {saved
                ? copy.settings.saved
                : isDirty
                  ? copy.settings.unsaved
                  : copy.settings.noChanges}
            </span>
            <Button
              disabled={!isDirty}
              onClick={() => {
                setStoredSettings(draft);
                setSaved(true);
              }}
              variant="primary"
            >
              {saved
                ? zh
                  ? "已保存"
                  : "Saved"
                : zh
                  ? "保存更改"
                  : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </ProductPage>
  );
}

function reloadThemeSelection() {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

function SettingsNavigation({ zh }: { zh: boolean }) {
  const groups = zh
    ? [
        ["工作区", ["通用", "环境", "成员"]],
        ["运营", ["审批策略", "Agent 边界", "恢复"]],
        ["证据", ["保留", "导出", "审计日志"]],
        ["开发者", ["API 访问", "Webhooks"]],
      ]
    : [
        ["Workspace", ["General", "Environments", "Members"]],
        ["Operations", ["Approval policy", "Agent bounds", "Recovery"]],
        ["Evidence", ["Retention", "Exports", "Audit log"]],
        ["Developer", ["API access", "Webhooks"]],
      ];
  return (
    <nav
      data-page-slot="settings-page__navigation"
      aria-label={zh ? "设置分类" : "Settings categories"}
    >
      {groups.map(([label, items], groupIndex) => (
        <div
          data-page-slot="settings-page__navigation-group"
          data-first={groupIndex === 0 ? "true" : "false"}
          key={label as string}
        >
          <div data-page-slot="settings-page__navigation-label">
            {label as string}
          </div>
          <div data-page-slot="settings-page__navigation-items">
            {(items as string[]).map((item, itemIndex) => (
              <button
                aria-current={
                  groupIndex === 0 && itemIndex === 0 ? "page" : undefined
                }
                data-page-slot={`settings-page__navigation-item ${
                  groupIndex === 0 && itemIndex === 0
                    ? "settings-page__navigation-item--active"
                    : ""
                }`}
                key={item}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SettingsSelect({
  children,
  label,
  onChange,
  value,
}: React.PropsWithChildren<{
  label: string;
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <Select
      aria-label={label}
      data-page-slot="settings-page__select"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {children}
    </Select>
  );
}

function SettingsToggle({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  const toggleStyleProps = stylex.props(
    settingsStyles.settingsToggle,
    value ? settingsStyles.settingsToggleOn : settingsStyles.settingsToggleOff
  );
  const knobStyleProps = stylex.props(
    settingsStyles.settingsToggleKnob,
    value
      ? settingsStyles.settingsToggleKnobOn
      : settingsStyles.settingsToggleKnobOff
  );

  return (
    <button
      aria-checked={value}
      aria-label={label}
      {...toggleStyleProps}
      data-page-slot="settings-page__toggle"
      onClick={() => onChange(!value)}
      role="switch"
      type="button"
    >
      <span {...knobStyleProps} data-page-slot="settings-page__toggle-knob" />
    </button>
  );
}
