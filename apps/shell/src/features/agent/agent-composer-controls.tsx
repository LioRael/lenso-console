import { Button } from "@lenso/ui/button";
import { Menu } from "@lenso/ui/menu";
import { Select } from "@lenso/ui/select";
import * as stylex from "@stylexjs/stylex";
import {
  Check,
  ChevronDown,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { composerOverlayStyles as overlay } from "./agent-composer-overlay.stylex";
import { agentPageStyles as styles } from "./agent-page.stylex";

type ComposerOption = { label: string; value: string };

export type ComposerSuggestion = {
  description: string;
  icon: LucideIcon;
  insertText: string;
  label: string;
};

type ComposerChoiceProps = {
  compact?: boolean;
  "aria-label": string;
  disabled: boolean;
  icon: ReactNode;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<ComposerOption>;
  value: string;
};

export function ComposerSlashMenu({
  activeIndex,
  menuId,
  onActiveIndexChange,
  onSelect,
  suggestions,
}: {
  activeIndex: number;
  menuId: string;
  onActiveIndexChange: (index: number) => void;
  onSelect: (suggestion: ComposerSuggestion) => void;
  suggestions: ReadonlyArray<ComposerSuggestion>;
}) {
  const t = useConsoleTranslation();

  if (suggestions.length === 0) {
    return null;
  }
  return (
    <menu
      aria-label={t("Slash command suggestions")}
      id={menuId}
      {...stylex.props(styles.contextSuggestions)}
    >
      {suggestions.map((suggestion, index) => (
        <button
          aria-label={`${suggestion.label}: ${suggestion.description}`}
          aria-current={index === activeIndex ? "true" : undefined}
          data-active={index === activeIndex ? "" : undefined}
          id={`${menuId}-item-${index}`}
          {...stylex.props(styles.contextSuggestion)}
          key={suggestion.insertText}
          onClick={() => onSelect(suggestion)}
          onMouseEnter={() => onActiveIndexChange(index)}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          <suggestion.icon
            aria-hidden="true"
            className={stylex.props(styles.contextSuggestionIcon).className}
            size={14}
          />
          <strong {...stylex.props(styles.contextSuggestionTitle)}>
            {suggestion.label}
          </strong>
          <small {...stylex.props(styles.contextSuggestionDescription)}>
            {suggestion.description}
          </small>
        </button>
      ))}
    </menu>
  );
}

export function TurnSelect({
  compact,
  "aria-label": ariaLabel,
  disabled,
  icon,
  onValueChange,
  options,
  value,
}: ComposerChoiceProps) {
  const t = useConsoleTranslation();
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];
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
      <Select.Trigger aria-label={t(ariaLabel)} xstyle={styles.composerControl}>
        {icon}
        <Select.Value xstyle={styles.composerControlValue}>
          {compact ? null : t(selectedOption?.label ?? value)}
        </Select.Value>
        <ChevronDown aria-hidden="true" size={11} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          xstyle={overlay.positioner}
          data-agent-composer-overlay={compact || undefined}
          align="start"
          alignItemWithTrigger={false}
          sideOffset={6}
        >
          <Select.Popup xstyle={styles.composerSelectPopup}>
            <Select.List>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  <Select.ItemText>{t(option.label)}</Select.ItemText>
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

type RunConfigurationMenuProps = {
  compact?: boolean;
  disabled: boolean;
  approvalSelection?: ComposerSelection | undefined;
  modelOptions: ReadonlyArray<ComposerOption>;
  modelValue: string;
  onModelChange: (value: string) => void;
  onReasoningEffortChange: (value: string) => void;
  onServiceTierChange: (value: string) => void;
  profileSelection?: ComposerSelection | undefined;
  reasoningEffortOptions: ReadonlyArray<ComposerOption>;
  reasoningEffortValue: string;
  serviceTierOptions: ReadonlyArray<ComposerOption>;
  serviceTierValue: string;
};

type ComposerSelection = {
  onValueChange: (value: string) => void;
  options: ReadonlyArray<ComposerOption>;
  value: string;
};

export function RunConfigurationMenu({
  compact,
  disabled,
  approvalSelection,
  modelOptions,
  modelValue,
  onModelChange,
  onReasoningEffortChange,
  onServiceTierChange,
  profileSelection,
  reasoningEffortOptions,
  reasoningEffortValue,
  serviceTierOptions,
  serviceTierValue,
}: RunConfigurationMenuProps) {
  const t = useConsoleTranslation();

  const selectedModel =
    modelOptions.find((option) => option.value === modelValue) ??
    modelOptions[0];
  const selectedReasoningEffort =
    reasoningEffortOptions.find(
      (option) => option.value === reasoningEffortValue
    ) ?? reasoningEffortOptions[0];
  const selectedServiceTier =
    serviceTierOptions.find((option) => option.value === serviceTierValue) ??
    serviceTierOptions[0];
  const selectedApproval = approvalSelection?.options.find(
    (option) => option.value === approvalSelection.value
  );
  const selectedProfile = profileSelection?.options.find(
    (option) => option.value === profileSelection.value
  );
  const hasOptions =
    Boolean(profileSelection || approvalSelection) ||
    modelOptions.length > 0 ||
    reasoningEffortOptions.length > 0 ||
    serviceTierOptions.length > 0;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            aria-label={t("Run configuration")}
            disabled={disabled}
            size="sm"
            variant="ghost"
            xstyle={styles.composerControl}
          >
            <SlidersHorizontal aria-hidden="true" size={13} />
            <span {...stylex.props(styles.composerControlValue)}>
              {compact
                ? t("Run settings")
                : (selectedModel?.label ?? t("Run settings"))}
            </span>
            {selectedApproval?.value ? (
              <span {...stylex.props(styles.composerControlSecondaryValue)}>
                {t(selectedApproval.label)}
              </span>
            ) : selectedProfile?.value ? (
              <span {...stylex.props(styles.composerControlSecondaryValue)}>
                {t(selectedProfile.label)}
              </span>
            ) : !compact && selectedReasoningEffort?.value ? (
              <span {...stylex.props(styles.composerControlSecondaryValue)}>
                {t(selectedReasoningEffort.label)}
              </span>
            ) : null}
            <ChevronDown aria-hidden="true" size={11} />
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner
          xstyle={overlay.positioner}
          data-agent-composer-overlay={compact || undefined}
          align="end"
          side="top"
          sideOffset={8}
        >
          <Menu.Popup
            aria-label={t("Run configuration")}
            xstyle={styles.runConfigurationMenu}
          >
            {hasOptions ? null : (
              <p {...stylex.props(styles.runConfigurationEmpty)}>
                {t("Agent options will appear when it is ready.")}
              </p>
            )}
            {profileSelection ? (
              <ConfigurationSubmenu
                compact={compact}
                ariaLabel="Agent modes"
                label={t("Agent mode")}
                onValueChange={(value) => profileSelection.onValueChange(value)}
                options={profileSelection.options}
                value={profileSelection.value}
                valueLabel={selectedProfile?.label}
              />
            ) : null}
            {modelOptions.length > 0 ? (
              <ModelSubmenu
                compact={compact}
                onValueChange={onModelChange}
                options={modelOptions}
                value={modelValue}
                valueLabel={selectedModel?.label}
              />
            ) : null}
            {reasoningEffortOptions.length ? (
              <ConfigurationSubmenu
                compact={compact}
                ariaLabel="Reasoning efforts"
                label={t("Reasoning")}
                onValueChange={onReasoningEffortChange}
                options={reasoningEffortOptions}
                value={reasoningEffortValue}
                valueLabel={selectedReasoningEffort?.label}
              />
            ) : null}
            {serviceTierOptions.length ? (
              <ConfigurationSubmenu
                compact={compact}
                ariaLabel="Service tiers"
                label={t("Speed")}
                onValueChange={onServiceTierChange}
                options={serviceTierOptions}
                value={serviceTierValue}
                valueLabel={selectedServiceTier?.label}
              />
            ) : null}
            {approvalSelection ? (
              <ConfigurationSubmenu
                compact={compact}
                ariaLabel="Approval modes"
                label={t("Approval mode")}
                onValueChange={(value) =>
                  approvalSelection.onValueChange(value)
                }
                options={approvalSelection.options}
                value={approvalSelection.value}
                valueLabel={selectedApproval?.label}
              />
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ModelSubmenu({
  compact,
  onValueChange,
  options,
  value,
  valueLabel,
}: {
  compact?: boolean | undefined;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<ComposerOption>;
  value: string;
  valueLabel: string | undefined;
}) {
  const t = useConsoleTranslation();
  const menuId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOptions = normalizedQuery
    ? options.filter(
        (option) =>
          option.label.toLocaleLowerCase().includes(normalizedQuery) ||
          option.value.toLocaleLowerCase().includes(normalizedQuery)
      )
    : options;

  return (
    <Menu.SubmenuRoot
      onOpenChange={(open) => {
        if (open) {
          setQuery("");
          requestAnimationFrame(() => searchInput.current?.focus());
        }
      }}
    >
      <Menu.SubmenuTrigger xstyle={styles.runConfigurationItem}>
        <Menu.Item.Label>{t("Model")}</Menu.Item.Label>
        <span {...stylex.props(styles.runConfigurationItemValue)}>
          {valueLabel ?? value}
        </span>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner
          xstyle={overlay.positioner}
          data-agent-composer-overlay={compact || undefined}
          align="end"
          sideOffset={6}
        >
          <Menu.Popup
            aria-label={t("Models")}
            id={menuId}
            xstyle={styles.runConfigurationSubmenu}
          >
            <div {...stylex.props(styles.modelMenuSearch)}>
              <Search aria-hidden="true" size={13} strokeWidth={1.7} />
              <input
                {...stylex.props(styles.modelMenuSearchInput)}
                aria-autocomplete="list"
                aria-controls={menuId}
                aria-expanded="true"
                aria-haspopup="menu"
                aria-label={t("Search models")}
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={focusFirstModelItem}
                placeholder={t("Search models…")}
                ref={searchInput}
                role="combobox"
                type="search"
                value={query}
              />
            </div>
            <div
              {...stylex.props(styles.modelMenuOptions)}
              data-slot="model-menu-options"
            >
              {visibleOptions.map((option) => (
                <Menu.Item
                  key={option.value}
                  onClick={() => onValueChange(option.value)}
                  xstyle={styles.runConfigurationOption}
                >
                  <Menu.Item.Label>{t(option.label)}</Menu.Item.Label>
                  {option.value === value ? (
                    <span>
                      <Check aria-hidden="true" size={14} strokeWidth={1.7} />
                    </span>
                  ) : null}
                </Menu.Item>
              ))}
              {visibleOptions.length === 0 ? (
                <p {...stylex.props(styles.modelMenuEmpty)}>
                  {t("No models found")}
                </p>
              ) : null}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

function ConfigurationSubmenu({
  compact,
  ariaLabel,
  label,
  onValueChange,
  options,
  value,
  valueLabel,
}: {
  compact?: boolean | undefined;
  ariaLabel: string;
  label: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<ComposerOption>;
  value: string;
  valueLabel: string | undefined;
}) {
  const t = useConsoleTranslation();
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger xstyle={styles.runConfigurationItem}>
        <Menu.Item.Label>{t(label)}</Menu.Item.Label>
        <span {...stylex.props(styles.runConfigurationItemValue)}>
          {t(valueLabel ?? value)}
        </span>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner
          xstyle={overlay.positioner}
          data-agent-composer-overlay={compact || undefined}
          align="end"
          sideOffset={6}
        >
          <Menu.Popup
            aria-label={t(ariaLabel)}
            xstyle={styles.runConfigurationSubmenu}
          >
            <div {...stylex.props(styles.runConfigurationOptionList)}>
              {options.map((option) => (
                <Menu.Item
                  key={option.value}
                  onClick={() => onValueChange(option.value)}
                  xstyle={styles.runConfigurationOption}
                >
                  <Menu.Item.Label>{t(option.label)}</Menu.Item.Label>
                  {option.value === value ? (
                    <span>
                      <Check aria-hidden="true" size={14} strokeWidth={1.7} />
                    </span>
                  ) : null}
                </Menu.Item>
              ))}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

function focusFirstModelItem(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    event.currentTarget
      .closest('[role="menu"]')
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
    return;
  }
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}
