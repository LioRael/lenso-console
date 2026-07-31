import {
  useConsoleLocale,
  type ConsoleLanguagePreference,
} from "@lenso/console-package-api";

import {
  useConsoleAppearance,
  type ConsoleThemePreference,
} from "../../app/console-appearance";
import { ProductPage } from "../console-design/components";

export function SettingsPage() {
  const appearance = useConsoleAppearance();
  const locale = useConsoleLocale();
  return (
    <ProductPage
      description="Personalize the Console without changing service-owned runtime state."
      title="Settings"
    >
      <div className="max-w-[760px] pt-8">
        <SettingsGroup label="Appearance">
          <SettingsRow
            description="Choose a theme or follow your operating system."
            label="Theme"
          >
            <Segmented
              onChange={(value) =>
                appearance.setPreference(value as ConsoleThemePreference)
              }
              options={["system", "dark", "light"]}
              value={appearance.preference}
            />
          </SettingsRow>
        </SettingsGroup>
        <SettingsGroup label="Language">
          <SettingsRow
            description="Applies to host navigation and all extensions using the Console locale interface."
            label="Console language"
          >
            <select
              className="h-8 min-w-40 rounded-[var(--radius-control)] border border-(--line-strong) bg-(--bg-control) px-2 text-[12px]"
              onChange={(event) =>
                locale.setPreference(
                  event.target.value as ConsoleLanguagePreference
                )
              }
              value={locale.preference}
            >
              <option value="system">System</option>
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
            </select>
          </SettingsRow>
        </SettingsGroup>
        <SettingsGroup label="Console">
          <SettingsRow
            description="Open the command palette from anywhere."
            label="Command menu"
          >
            <kbd className="rounded border border-(--line) px-2 py-1 font-mono text-[11px]">
              ⌘ K
            </kbd>
          </SettingsRow>
          <SettingsRow
            description="Collapse or expand the workspace navigation."
            label="Sidebar"
          >
            <kbd className="rounded border border-(--line) px-2 py-1 font-mono text-[11px]">
              ⌘ B
            </kbd>
          </SettingsRow>
        </SettingsGroup>
      </div>
    </ProductPage>
  );
}

function SettingsGroup({
  children,
  label,
}: React.PropsWithChildren<{ label: string }>) {
  return (
    <section className="mb-9">
      <h2 className="mb-2 pl-3 text-[11px] font-medium text-(--fg-tertiary)">
        {label}
      </h2>
      <div className="border-t border-(--line)">{children}</div>
    </section>
  );
}

function SettingsRow({
  children,
  description,
  label,
}: React.PropsWithChildren<{ description: string; label: string }>) {
  return (
    <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-(--line) px-3">
      <div>
        <h3 className="text-[13px] font-medium">{label}</h3>
        <p className="mt-0.5 text-[11px] text-(--fg-tertiary)">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Segmented({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <div className="flex rounded-[var(--radius-control)] border border-(--line-strong) p-0.5">
      {options.map((option) => (
        <button
          className={`h-7 rounded-[4px] px-3 text-[11px] capitalize ${value === option ? "bg-(--bg-row-selected) text-(--fg-inverse)" : "text-(--fg-secondary) hover:text-(--fg-primary)"}`}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
