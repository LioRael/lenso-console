import { Button } from "@lenso/ui/button";
import { Menu } from "@lenso/ui/menu";
import { Select } from "@lenso/ui/select";
import * as stylex from "@stylexjs/stylex";
import { Bot, Check, ChevronDown, Search, type LucideIcon } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { agentPageStyles as styles } from "./agent-page.stylex";

type ComposerOption = { label: string; value: string };

export type ComposerSuggestion = {
  description: string;
  icon: LucideIcon;
  insertText: string;
  label: string;
};

type ComposerChoiceProps = {
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
  if (suggestions.length === 0) {
    return null;
  }
  return (
    <menu
      aria-label="Slash command suggestions"
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
  "aria-label": ariaLabel,
  disabled,
  icon,
  onValueChange,
  options,
  value,
}: ComposerChoiceProps) {
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
      <Select.Trigger aria-label={ariaLabel} xstyle={styles.composerControl}>
        {icon}
        <Select.Value xstyle={styles.composerControlValue}>
          {selectedOption?.label ?? value}
        </Select.Value>
        <ChevronDown aria-hidden="true" size={11} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="start" position="popper" sideOffset={6}>
          <Select.Popup xstyle={styles.composerSelectPopup}>
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

type RunConfigurationMenuProps = {
  disabled: boolean;
  modelOptions: ReadonlyArray<ComposerOption>;
  modelValue: string;
  onModelChange: (value: string) => void;
  onReasoningEffortChange: (value: string) => void;
  onServiceTierChange: (value: string) => void;
  reasoningEffortOptions: ReadonlyArray<ComposerOption>;
  reasoningEffortValue: string;
  serviceTierOptions: ReadonlyArray<ComposerOption>;
  serviceTierValue: string;
};

export function RunConfigurationMenu({
  disabled,
  modelOptions,
  modelValue,
  onModelChange,
  onReasoningEffortChange,
  onServiceTierChange,
  reasoningEffortOptions,
  reasoningEffortValue,
  serviceTierOptions,
  serviceTierValue,
}: RunConfigurationMenuProps) {
  const menuId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
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
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOptions = normalizedQuery
    ? modelOptions.filter(
        (option) =>
          option.label.toLocaleLowerCase().includes(normalizedQuery) ||
          option.value.toLocaleLowerCase().includes(normalizedQuery)
      )
    : modelOptions;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            aria-label="Run configuration"
            disabled={disabled}
            size="compact"
            variant="ghost"
            xstyle={styles.composerControl}
          >
            <Bot aria-hidden="true" size={12} />
            <span {...stylex.props(styles.composerControlValue)}>
              {selectedModel?.label ?? modelValue}
            </span>
            {selectedReasoningEffort?.value ? (
              <span {...stylex.props(styles.composerControlSecondaryValue)}>
                {selectedReasoningEffort.label}
              </span>
            ) : null}
            <ChevronDown aria-hidden="true" size={11} />
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="end" side="top" sideOffset={8}>
          <Menu.Popup
            aria-label="Run configuration"
            xstyle={styles.runConfigurationMenu}
          >
            <Menu.SubmenuRoot
              onOpenChange={(open) => {
                if (open) {
                  setQuery("");
                  requestAnimationFrame(() => searchInput.current?.focus());
                }
              }}
            >
              <Menu.SubmenuTrigger xstyle={styles.runConfigurationItem}>
                <Menu.Label>Model</Menu.Label>
                <span {...stylex.props(styles.runConfigurationItemValue)}>
                  {selectedModel?.label ?? modelValue}
                </span>
              </Menu.SubmenuTrigger>
              <Menu.Portal>
                <Menu.Positioner align="end" sideOffset={6}>
                  <Menu.Popup
                    aria-label="Models"
                    id={menuId}
                    submenu
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
                        aria-label="Search models"
                        autoComplete="off"
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={focusFirstModelItem}
                        placeholder="Search models…"
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
                          onClick={() => onModelChange(option.value)}
                          xstyle={styles.runConfigurationOption}
                        >
                          <Menu.Label>{option.label}</Menu.Label>
                          {option.value === modelValue ? (
                            <Menu.Trailing>
                              <Check
                                aria-hidden="true"
                                size={14}
                                strokeWidth={1.7}
                              />
                            </Menu.Trailing>
                          ) : null}
                        </Menu.Item>
                      ))}
                      {visibleOptions.length === 0 ? (
                        <p {...stylex.props(styles.modelMenuEmpty)}>
                          No models found
                        </p>
                      ) : null}
                    </div>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.SubmenuRoot>
            {reasoningEffortOptions.length ? (
              <ConfigurationSubmenu
                ariaLabel="Reasoning efforts"
                label="Reasoning"
                onValueChange={onReasoningEffortChange}
                options={reasoningEffortOptions}
                value={reasoningEffortValue}
                valueLabel={selectedReasoningEffort?.label}
              />
            ) : null}
            {serviceTierOptions.length ? (
              <ConfigurationSubmenu
                ariaLabel="Service tiers"
                label="Speed"
                onValueChange={onServiceTierChange}
                options={serviceTierOptions}
                value={serviceTierValue}
                valueLabel={selectedServiceTier?.label}
              />
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ConfigurationSubmenu({
  ariaLabel,
  label,
  onValueChange,
  options,
  value,
  valueLabel,
}: {
  ariaLabel: string;
  label: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<ComposerOption>;
  value: string;
  valueLabel: string | undefined;
}) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger xstyle={styles.runConfigurationItem}>
        <Menu.Label>{label}</Menu.Label>
        <span {...stylex.props(styles.runConfigurationItemValue)}>
          {valueLabel ?? value}
        </span>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={6}>
          <Menu.Popup
            aria-label={ariaLabel}
            submenu
            xstyle={styles.runConfigurationSubmenu}
          >
            <div {...stylex.props(styles.runConfigurationOptionList)}>
              {options.map((option) => (
                <Menu.Item
                  key={option.value}
                  onClick={() => onValueChange(option.value)}
                  xstyle={styles.runConfigurationOption}
                >
                  <Menu.Label>{option.label}</Menu.Label>
                  {option.value === value ? (
                    <Menu.Trailing>
                      <Check aria-hidden="true" size={14} strokeWidth={1.7} />
                    </Menu.Trailing>
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
