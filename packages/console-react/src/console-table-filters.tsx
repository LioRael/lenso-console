import {
  Modal,
  Popover,
  Select,
  ThemeScope,
  Tooltip,
  useMediaQuery,
} from "@lenso/ui";
import { Button, type ButtonRootProps } from "@lenso/ui/button";
import { Input } from "@lenso/ui/input";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ChevronUp, ListFilter, X } from "lucide-react";
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type KeyboardEventHandler,
} from "react";

import {
  consoleFilterOperatorLabels,
  createConsoleFilterCondition,
  changeConsoleFilterOperator,
  changeConsoleFilterValue,
  consoleFilterOperators,
  consoleFilterValueLabel,
  validateConsoleFilter,
  validateConsoleFilterGroup,
  isConsoleFilterGroup,
  consoleFilterLimits,
  summarizeConsoleFilters,
  type ConsoleFilterCondition,
  type ConsoleFilterField,
  type ConsoleFilterGroup,
  type ConsoleFilterNode,
} from "./console-filter-model";
import { ConsoleIconButton } from "./console-icon-button";

export type {
  ConsoleFilterCondition,
  ConsoleFilterField,
  ConsoleFilterOperator,
  ConsoleFilterGroup,
  ConsoleFilterNode,
} from "./console-filter-model";
export {
  evaluateConsoleFilter,
  matchesConsoleFilterDate,
} from "./console-filter-model";

interface FilterPresentation {
  label: string;
  fields: readonly ConsoleFilterField[];
  disabled?: boolean;
  /** Project conditions and actions together without moving their state owner. */
  renderGroup?: (group: ReactNode) => ReactNode;
}

// ThemeScope's body portal sits outside a modal's accessible subtree.
const FilterPortalContext = createContext<HTMLElement | null>(null);

export type ConsoleTableFiltersProps = FilterPresentation &
  (
    | {
        conditions: readonly ConsoleFilterCondition[];
        onConditionsChange: (
          conditions: readonly ConsoleFilterCondition[]
        ) => void;
        value?: never;
        onValueChange?: never;
      }
    | {
        value: ConsoleFilterGroup;
        onValueChange: (value: ConsoleFilterGroup) => void;
        conditions?: never;
        onConditionsChange?: never;
      }
  );

function leafConditions(
  node: ConsoleFilterNode
): readonly ConsoleFilterCondition[] {
  return isConsoleFilterGroup(node)
    ? node.children.flatMap(leafConditions)
    : [node];
}

function Choice({
  label,
  value,
  options,
  change,
  triggerRef,
  onKeyDown,
  placeholder,
  disabled,
  entry,
}: {
  label: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  change: (value: string) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  placeholder?: string;
  disabled?: boolean;
  entry?: string;
}) {
  const modalPortal = useContext(FilterPortalContext);
  return (
    <Select.Root
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) {
          change(next);
        }
      }}
    >
      <Select.Trigger
        ref={triggerRef}
        variant="secondary"
        aria-label={label}
        data-filter-entry={entry}
        xstyle={styles.control}
        onKeyDown={onKeyDown}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Indicator />
      </Select.Trigger>
      <ThemeScope>
        <Select.Portal container={modalPortal ?? undefined}>
          <Select.Positioner sideOffset={8}>
            <Select.Popover>
              <Select.List>
                {options.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    xstyle={styles.control}
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popover>
          </Select.Positioner>
        </Select.Portal>
      </ThemeScope>
    </Select.Root>
  );
}

function ConditionValue({
  field,
  condition,
  change,
  inputRef,
  selectRef,
  errorId,
  onKeyDown,
}: {
  field: ConsoleFilterField | undefined;
  condition: ConsoleFilterCondition;
  change: (index: 0 | 1, value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  selectRef: RefObject<HTMLButtonElement | null>;
  errorId: string | undefined;
  onKeyDown: KeyboardEventHandler<HTMLElement>;
}) {
  const first =
    typeof condition.value === "string" ? condition.value : condition.value[0];
  if (field?.kind === "enum") {
    return (
      <Choice
        label={`Value for ${field.label}`}
        value={first}
        triggerRef={selectRef}
        onKeyDown={onKeyDown}
        options={field.options}
        change={(value) => change(0, value)}
      />
    );
  }
  return (
    <>
      <Input
        ref={inputRef}
        onKeyDown={onKeyDown}
        aria-label={
          condition.operator === "between"
            ? "Lower bound"
            : `Value for ${field?.label ?? "condition"}`
        }
        aria-invalid={!!errorId}
        aria-describedby={errorId}
        value={first}
        type={field?.kind === "date" ? "date" : "text"}
        maxLength={field?.kind === "text" ? field.maxLength : undefined}
        inputMode={field?.kind === "number" ? "decimal" : "text"}
        onValueChange={(value) => change(0, value)}
        xstyle={styles.value}
      />
      {condition.operator === "between" && (
        <>
          <span>and</span>
          <Input
            aria-label="Upper bound"
            value={condition.value[1]}
            type={field?.kind === "date" ? "date" : "text"}
            inputMode="decimal"
            onKeyDown={onKeyDown}
            aria-invalid={!!errorId}
            aria-describedby={errorId}
            onValueChange={(value) => change(1, value)}
            xstyle={styles.value}
          />
        </>
      )}
    </>
  );
}

function ConditionEditor({
  condition,
  update,
  fields,
  showErrors,
  collapse,
  remove,
}: {
  condition: ConsoleFilterCondition;
  update: (
    change: (condition: ConsoleFilterCondition) => ConsoleFilterCondition
  ) => void;
  fields: readonly ConsoleFilterField[];
  showErrors: boolean;
  collapse: () => void;
  remove: () => void;
}) {
  const setCondition = update;
  const { field: fieldId, operator } = condition;
  const valueInput = useRef<HTMLInputElement>(null);
  const enumTrigger = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const field = fields.find((item) => item.id === fieldId);
  const error = validateConsoleFilter(field, condition);
  useLayoutEffect(() => {
    const control = valueInput.current ?? enumTrigger.current;
    control?.focus({ preventScroll: true });
  }, []);
  const handleKeyDown: KeyboardEventHandler<HTMLElement> = (event) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      collapse();
    }
  };
  return (
    <fieldset
      aria-label="Edit condition"
      data-console-filter-editing=""
      {...stylex.props(styles.editor)}
    >
      <header {...stylex.props(styles.groupHeader)}>
        <span {...stylex.props(styles.fieldLabel)}>Condition</span>
        <div {...stylex.props(styles.headerActions)}>
          <ConsoleIconButton
            label={`Remove ${field?.label ?? condition.field} condition`}
            variant="ghost"
            onClick={remove}
          >
            <X size={16} aria-hidden="true" />
          </ConsoleIconButton>
          <ConsoleIconButton
            label={`Collapse ${field?.label ?? condition.field} condition`}
            variant="ghost"
            onClick={collapse}
          >
            <ChevronUp size={16} aria-hidden="true" />
          </ConsoleIconButton>
        </div>
      </header>
      <div {...stylex.props(styles.editorRow)}>
        <div {...stylex.props(styles.editorField)}>
          <span {...stylex.props(styles.fieldLabel)}>Field</span>
          <Choice
            label="Filter field"
            value={fieldId}
            onKeyDown={handleKeyDown}
            options={fields.map((item) => ({
              value: item.id,
              label: item.label,
            }))}
            change={(value) => {
              const next = fields.find((item) => item.id === value);
              if (next) {
                setCondition(() =>
                  createConsoleFilterCondition(next, condition.id)
                );
              }
            }}
          />
        </div>
        {field && (
          <div {...stylex.props(styles.editorField)}>
            <span {...stylex.props(styles.fieldLabel)}>Rule</span>
            <Choice
              label={`Rule for ${field.label}`}
              value={operator}
              onKeyDown={handleKeyDown}
              options={consoleFilterOperators(field).map((value) => ({
                value,
                label: consoleFilterOperatorLabels[value],
              }))}
              change={(value) => {
                const next = consoleFilterOperators(field).find(
                  (item) => item === value
                );
                if (next) {
                  setCondition((current) =>
                    changeConsoleFilterOperator(current, next)
                  );
                }
              }}
            />
          </div>
        )}
        <div {...stylex.props(styles.editorValue)}>
          <span {...stylex.props(styles.fieldLabel)}>Value</span>
          <div {...stylex.props(styles.valueRow)}>
            <ConditionValue
              field={field}
              condition={condition}
              inputRef={valueInput}
              selectRef={enumTrigger}
              errorId={showErrors && error ? errorId : undefined}
              onKeyDown={handleKeyDown}
              change={(index, value) =>
                setCondition((current) =>
                  changeConsoleFilterValue(current, index, value)
                )
              }
            />
          </div>
        </div>
      </div>
      {showErrors && error && (
        <p id={errorId} {...stylex.props(styles.error)}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function ConsoleTableFilters(props: ConsoleTableFiltersProps) {
  const id = useId();
  if (!props.fields.length) {
    return null;
  }
  if (props.value) {
    return <TreeFilters {...props} />;
  }
  return (
    <TreeFilters
      label={props.label}
      fields={props.fields}
      disabled={props.disabled}
      renderGroup={props.renderGroup}
      grouping={false}
      value={{ id, operator: "and", children: props.conditions }}
      onValueChange={(next) =>
        props.onConditionsChange(
          next.children.filter(
            (node): node is ConsoleFilterCondition =>
              !isConsoleFilterGroup(node)
          )
        )
      }
    />
  );
}

function nodeCount(group: ConsoleFilterGroup): number {
  return (
    1 +
    group.children.reduce(
      (total, child) =>
        total + (isConsoleFilterGroup(child) ? nodeCount(child) : 1),
      0
    )
  );
}

function replaceConditions(
  group: ConsoleFilterGroup,
  conditions: readonly ConsoleFilterCondition[]
): ConsoleFilterGroup {
  const existing = new Set(group.children.map((node) => node.id));
  return {
    ...group,
    children: [
      ...group.children.flatMap<ConsoleFilterNode>((node) => {
        if (isConsoleFilterGroup(node)) {
          return [node];
        }
        const next = conditions.find((condition) => condition.id === node.id);
        return next ? [next] : [];
      }),
      ...conditions.filter((condition) => !existing.has(condition.id)),
    ],
  };
}

function GroupLogic({
  value,
  label,
  change,
  triggerRef,
  readOnly,
}: {
  value: ConsoleFilterGroup;
  label: string;
  change: (value: ConsoleFilterGroup) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return <span {...stylex.props(styles.fieldLabel)}>Match all</span>;
  }
  return (
    <div {...stylex.props(styles.logicHeader)}>
      <span {...stylex.props(styles.fieldLabel)}>Match</span>
      <Choice
        label={label}
        triggerRef={triggerRef}
        value={value.operator}
        options={[
          { value: "and", label: "All" },
          { value: "or", label: "Any" },
        ]}
        change={(operator) =>
          change({ ...value, operator: operator === "or" ? "or" : "and" })
        }
      />
    </div>
  );
}

function FilterConditionRow({
  condition,
  fields,
  peers,
  repeatFields,
  expanded,
  showErrors,
  edit,
  collapse,
  change,
  remove,
}: {
  condition: ConsoleFilterCondition;
  fields: readonly ConsoleFilterField[];
  peers: readonly ConsoleFilterCondition[];
  repeatFields: boolean;
  expanded: boolean;
  showErrors: boolean;
  edit: () => void;
  collapse: () => void;
  change: (condition: ConsoleFilterCondition) => void;
  remove: () => void;
}) {
  const field = fields.find((item) => item.id === condition.field);
  const name = field?.label ?? condition.field;
  if (expanded) {
    return (
      <div {...stylex.props(styles.inlineEditor)}>
        <ConditionEditor
          condition={condition}
          fields={fields.filter(
            (item) =>
              repeatFields ||
              !peers.some(
                (peer) => peer.id !== condition.id && peer.field === item.id
              )
          )}
          update={(update) => change(update(condition))}
          showErrors={showErrors}
          collapse={collapse}
          remove={remove}
        />
      </div>
    );
  }
  return (
    <fieldset
      aria-label={`${name} condition`}
      {...stylex.props(styles.conditionRow)}
    >
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Edit ${name} condition`}
        data-filter-condition={condition.id}
        xstyle={styles.rowButton}
        onClick={edit}
      >
        <span {...stylex.props(styles.rowField)}>{name}</span>
        <span {...stylex.props(styles.rowRule)}>
          {consoleFilterOperatorLabels[condition.operator]}
        </span>
        <span>
          {field
            ? consoleFilterValueLabel(field, condition) || "Set a value"
            : "Unavailable"}
        </span>
      </Button>
      <ConsoleIconButton
        label={`Remove ${name} condition`}
        variant="ghost"
        onClick={remove}
      >
        <X size={16} aria-hidden="true" />
      </ConsoleIconButton>
    </fieldset>
  );
}

function FilterGroupHeader({
  value,
  path,
  depth,
  readOnly,
  logic,
  collapsed,
  contentId,
  toggle,
  change,
  remove,
}: {
  value: ConsoleFilterGroup;
  path: string;
  depth: number;
  readOnly: boolean;
  logic: RefObject<HTMLButtonElement | null>;
  collapsed: boolean;
  contentId: string;
  toggle: () => void;
  change: (value: ConsoleFilterGroup) => void;
  remove?: (() => void) | undefined;
}) {
  return (
    <header {...stylex.props(styles.groupHeader)}>
      <GroupLogic
        value={value}
        label={depth === 1 ? "Filter logic" : `Logic for group ${path}`}
        triggerRef={logic}
        readOnly={readOnly}
        change={change}
      />
      <div {...stylex.props(styles.headerActions)}>
        {depth > 1 && (
          <ConsoleIconButton
            label={`${collapsed ? "Expand" : "Collapse"} group ${path}`}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            variant="ghost"
            onClick={toggle}
          >
            {collapsed ? (
              <ChevronDown size={16} aria-hidden="true" />
            ) : (
              <ChevronUp size={16} aria-hidden="true" />
            )}
          </ConsoleIconButton>
        )}
        {remove && (
          <ConsoleIconButton
            label={`Remove group ${path}`}
            variant="ghost"
            onClick={remove}
          >
            <X size={16} aria-hidden="true" />
          </ConsoleIconButton>
        )}
      </div>
    </header>
  );
}

/** The editor presents a tree of rows and containers, never another corner toolbar. */
function GroupEditor({
  value,
  fields,
  path,
  depth,
  canAdd,
  change,
  remove,
  target,
  onTarget,
  allowGroups,
  attempt,
}: {
  value: ConsoleFilterGroup;
  fields: readonly ConsoleFilterField[];
  path: string;
  depth: number;
  canAdd: boolean;
  change: (value: ConsoleFilterGroup) => void;
  remove?: () => void;
  target: string | null;
  onTarget: (target: string | null) => void;
  allowGroups: boolean;
  attempt: number;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const logic = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<string | null | undefined>(undefined);
  const conditions = value.children.filter(
    (node): node is ConsoleFilterCondition => !isConsoleFilterGroup(node)
  );
  const editing = conditions.find((condition) => condition.id === editingId);
  const invalidId = attempt
    ? conditions.find((condition) =>
        validateConsoleFilter(
          fields.find((field) => field.id === condition.field),
          condition
        )
      )?.id
    : undefined;
  const hasGroupError =
    attempt > 0 && !!validateConsoleFilterGroup(fields, value);
  useLayoutEffect(() => {
    if (invalidId) {
      setEditingId(invalidId);
    }
    if (hasGroupError) {
      setCollapsed(false);
    }
  }, [invalidId, hasGroupError, attempt]);
  useLayoutEffect(() => {
    if (!editing && focusAfter.current !== undefined) {
      const control = Array.from(
        root.current?.querySelectorAll<HTMLButtonElement>(
          "[data-filter-condition]"
        ) ?? []
      ).find((node) => node.dataset.filterCondition === focusAfter.current);
      (control ?? add.current)?.focus({ preventScroll: true });
      focusAfter.current = undefined;
    }
  }, [editing, value]);
  useLayoutEffect(() => {
    if (!target) {
      return;
    }
    if (target === value.id) {
      const control = value.children.length
        ? (logic.current ?? add.current)
        : add.current;
      control?.scrollIntoView({ block: "nearest" });
      control?.focus({ preventScroll: true });
      onTarget(null);
    }
  }, [target, value, onTarget]);
  function finish(id: string | null) {
    focusAfter.current = id;
    setEditingId(null);
  }
  function removeNode(id: string) {
    focusAfter.current = null;
    change({
      ...value,
      children: value.children.filter((node) => node.id !== id),
    });
    setEditingId(null);
  }
  return (
    <fieldset
      ref={root}
      aria-label={`Condition group ${path}`}
      {...stylex.props(styles.groupEditor, depth > 1 && styles.nestedEditor)}
    >
      {depth > 1 && <legend {...stylex.props(styles.fieldLabel)}>Group</legend>}
      <FilterGroupHeader
        value={value}
        path={path}
        depth={depth}
        readOnly={!allowGroups}
        logic={logic}
        collapsed={collapsed}
        contentId={contentId}
        toggle={() => setCollapsed((current) => !current)}
        change={change}
        remove={remove}
      />
      {collapsed && (
        <span {...stylex.props(styles.fieldLabel)}>
          {leafConditions(value).length} conditions
        </span>
      )}
      <div
        id={contentId}
        hidden={collapsed}
        {...stylex.props(styles.groupContent, collapsed && styles.hidden)}
      >
        <ol
          aria-label={`Conditions in group ${path}`}
          {...stylex.props(styles.conditionList)}
        >
          {value.children.map((node) => {
            if (isConsoleFilterGroup(node)) {
              const index = value.children
                .filter(isConsoleFilterGroup)
                .findIndex((child) => child.id === node.id);
              return (
                <li key={node.id} {...stylex.props(styles.listItem)}>
                  <GroupEditor
                    value={node}
                    fields={fields}
                    path={`${path}.${index + 1}`}
                    depth={depth + 1}
                    canAdd={canAdd}
                    target={target}
                    onTarget={onTarget}
                    allowGroups={allowGroups}
                    attempt={attempt}
                    change={(next) =>
                      change({
                        ...value,
                        children: value.children.map((child) =>
                          child.id === node.id ? next : child
                        ),
                      })
                    }
                    remove={() => removeNode(node.id)}
                  />
                </li>
              );
            }
            return (
              <li key={node.id} {...stylex.props(styles.listItem)}>
                <FilterConditionRow
                  condition={node}
                  fields={fields}
                  peers={conditions}
                  repeatFields={allowGroups}
                  expanded={editingId === node.id}
                  showErrors={attempt > 0}
                  edit={() => setEditingId(node.id)}
                  collapse={() => finish(node.id)}
                  change={(next) =>
                    change(
                      replaceConditions(
                        value,
                        conditions.map((condition) =>
                          condition.id === next.id ? next : condition
                        )
                      )
                    )
                  }
                  remove={() => removeNode(node.id)}
                />
              </li>
            );
          })}
        </ol>
        {value.children.length === 0 && (
          <p {...stylex.props(styles.emptyGroup)}>
            No conditions in this group.
          </p>
        )}
        <fieldset
          aria-label={`Add to group ${path}`}
          {...stylex.props(styles.groupAdd)}
        >
          <Choice
            label={`Add condition to group ${path}`}
            value={null}
            placeholder="Add condition"
            disabled={!canAdd || !!editing}
            triggerRef={add}
            entry={path}
            options={fields.map((field) => ({
              value: field.id,
              label: field.label,
            }))}
            change={(id) => {
              const field = fields.find((item) => item.id === id);
              if (field) {
                const existing =
                  !allowGroups &&
                  conditions.find((condition) => condition.field === id);
                const condition =
                  existing ||
                  createConsoleFilterCondition(field, crypto.randomUUID());
                if (!existing) {
                  change(replaceConditions(value, [...conditions, condition]));
                }
                setEditingId(condition.id);
              }
            }}
          />
          {allowGroups && depth < consoleFilterLimits.depth && (
            <Button
              size="sm"
              variant="ghost"
              xstyle={styles.control}
              disabled={!canAdd || !!editing}
              aria-label={`Add group to group ${path}`}
              onClick={() => {
                const id = crypto.randomUUID();
                change({
                  ...value,
                  children: [
                    ...value.children,
                    { id, operator: "and", children: [] },
                  ],
                });
                onTarget(id);
              }}
            >
              Add group
            </Button>
          )}
        </fieldset>
      </div>
    </fieldset>
  );
}

function FilterStatusButton({
  label,
  summary,
  count,
  ...props
}: ButtonRootProps & {
  label: string;
  summary: string;
  count: number;
}) {
  const [tooltip, setTooltip] = useState(false);
  return (
    <Tooltip.Root
      onOpenChange={(next) => {
        if (next) {
          setTooltip(true);
        }
      }}
      onOpenChangeComplete={(next) => {
        if (!next) {
          setTooltip(false);
        }
      }}
    >
      <Tooltip.Trigger
        render={
          <Button
            {...props}
            size="sm"
            variant="secondary"
            aria-label={`${label}: ${summary}`}
            aria-description={`${count} applied conditions`}
            xstyle={styles.entryButton}
          />
        }
      >
        <ListFilter
          size={18}
          aria-hidden="true"
          {...stylex.props(styles.icon, count > 0 && styles.activeIcon)}
        />
        <span {...stylex.props(styles.entryText)}>{summary}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          {...stylex.props(styles.icon)}
        />
      </Tooltip.Trigger>
      {tooltip && (
        <ThemeScope>
          <Tooltip.Portal>
            <Tooltip.Positioner side="bottom" sideOffset={8}>
              <Tooltip.Popup xstyle={styles.tooltip}>
                {label}: {summary}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </ThemeScope>
      )}
    </Tooltip.Root>
  );
}

function TreeFilters({
  label,
  fields,
  value,
  onValueChange,
  renderGroup,
  grouping = true,
  disabled = false,
}: FilterPresentation & {
  value: ConsoleFilterGroup;
  onValueChange: (value: ConsoleFilterGroup) => void;
  grouping?: boolean;
}) {
  const narrow = useMediaQuery("(max-width: 600px)");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState<string | null>(null);
  const entry = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [modalContainer, setModalContainer] = useState<HTMLElement | null>(
    null
  );
  const canAdd = nodeCount(draft) < consoleFilterLimits.nodes;
  const count = leafConditions(value).length;
  const summary = summarizeConsoleFilters(fields, value);
  useLayoutEffect(() => {
    if (!attempt) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      form.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [attempt, narrow]);
  function changeOpen(next: boolean) {
    if (next && disabled) {
      return;
    }
    if (next && !open) {
      setDraft(value);
      setError(null);
      setAttempt(0);
      setTarget(value.id);
    }
    setOpen(next);
  }
  function change(next: ConsoleFilterGroup) {
    setDraft(next);
    setError(null);
  }
  function apply() {
    if (!open || disabled) {
      return;
    }
    const problem = validateConsoleFilterGroup(fields, draft);
    setError(problem);
    if (problem) {
      setAttempt((current) => current + 1);
      return;
    }
    onValueChange(draft);
    setOpen(false);
  }
  const Root = narrow ? Modal.Root : Popover.Root;
  const Trigger = narrow ? Modal.Trigger : Popover.Trigger;
  const Portal = narrow ? Modal.Portal : Popover.Portal;
  const Title = narrow ? Modal.Title : Popover.Title;
  const Description = narrow ? Modal.Description : Popover.Description;
  const Close = narrow ? Modal.Close : Popover.Close;
  const panel = (
    <form
      ref={form}
      noValidate
      data-console-filter-editing={open ? "" : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      {...stylex.props(styles.panelForm)}
    >
      <header {...stylex.props(styles.panelHeader)}>
        <div>
          <Title xstyle={styles.panelTitle}>Filters</Title>
          <Description xstyle={styles.panelDescription}>
            Changes apply only when you choose Apply filters.
          </Description>
        </div>
        <Close
          render={<ConsoleIconButton label="Close filters" variant="ghost" />}
        >
          <X size={18} aria-hidden="true" />
        </Close>
      </header>
      <div {...stylex.props(styles.panelBody)}>
        {open && (
          <GroupEditor
            value={draft}
            fields={fields}
            path="1"
            depth={1}
            canAdd={canAdd}
            change={change}
            target={target}
            onTarget={setTarget}
            allowGroups={grouping}
            attempt={attempt}
          />
        )}
        {error && (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        )}
      </div>
      <footer {...stylex.props(styles.panelFooter)}>
        <Button
          size="sm"
          variant="ghost"
          xstyle={styles.control}
          disabled={disabled || !draft.children.length}
          aria-label="Clear filters"
          onClick={() => {
            setDraft({ ...draft, operator: "and", children: [] });
            setAttempt(0);
            setError(null);
            setTarget(draft.id);
          }}
        >
          Clear
        </Button>
        <div {...stylex.props(styles.footerActions)}>
          <Close
            render={
              <Button
                size="sm"
                variant="secondary"
                xstyle={styles.control}
                aria-label="Cancel filters"
              />
            }
          >
            Cancel
          </Close>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            xstyle={styles.control}
            aria-label="Apply filters"
            disabled={disabled}
          >
            Apply filters
          </Button>
        </div>
      </footer>
    </form>
  );
  const contents = (
    <Root open={open} onOpenChange={changeOpen}>
      <fieldset
        aria-label={label}
        data-console-filters=""
        {...stylex.props(styles.root, styles.entry)}
      >
        <Trigger
          render={
            <FilterStatusButton
              ref={entry}
              label={label}
              summary={summary}
              count={count}
              disabled={disabled}
            />
          }
        />
      </fieldset>
      <ThemeScope>
        <Portal>
          {narrow ? (
            <>
              <Modal.Backdrop variant="opaque" />
              <Modal.Viewport xstyle={styles.modalViewport}>
                <Modal.Popup
                  ref={setModalContainer}
                  size="full"
                  aria-label="Filters"
                  aria-modal="true"
                  data-console-filter-popup=""
                  inert={!open}
                  aria-hidden={!open || undefined}
                  finalFocus={entry}
                  xstyle={[styles.popup, styles.modalPopup]}
                >
                  <FilterPortalContext value={modalContainer}>
                    {panel}
                  </FilterPortalContext>
                </Modal.Popup>
              </Modal.Viewport>
            </>
          ) : (
            <Popover.Positioner side="bottom" align="end" sideOffset={10}>
              <Popover.Popup
                aria-label="Filters"
                data-console-filter-popup=""
                inert={!open}
                aria-hidden={!open || undefined}
                initialFocus={false}
                finalFocus={entry}
                xstyle={styles.popup}
              >
                {panel}
              </Popover.Popup>
            </Popover.Positioner>
          )}
        </Portal>
      </ThemeScope>
    </Root>
  );
  return renderGroup ? renderGroup(contents) : contents;
}

const styles = stylex.create({
  entry: { maxWidth: "min(280px, 100%)" },
  entryButton: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingInline: 10,
    minWidth: 0,
    maxWidth: "100%",
    minHeight: { default: 36, "@media (pointer: coarse)": 44 },
  },
  entryText: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  icon: { flexShrink: 0 },
  activeIcon: { color: "var(--accent)" },
  tooltip: {
    maxWidth: "min(320px, calc(100vw - 32px))",
    overflowWrap: "anywhere",
  },
  headerActions: { display: "flex", alignItems: "center", gap: 4 },
  groupContent: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
  },
  hidden: { display: "none" },
  panelForm: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    height: "100%",
    maxHeight: "inherit",
    margin: 0,
    overflow: "hidden",
    borderRadius: "inherit",
  },
  panelBody: {
    flexGrow: 1,
    minHeight: 0,
    minWidth: 0,
    overflowY: "auto",
    padding: 16,
  },
  modalViewport: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  modalPopup: {
    width: "calc(100vw - 24px)",
    maxWidth: "calc(100vw - 24px)",
    height: "calc(100dvh - 24px)",
    maxHeight: "calc(100dvh - 24px)",
    borderRadius: 16,
  },
  logicHeader: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
  groupEditor: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "100%",
    minWidth: 0,
    padding: 0,
    margin: 0,
    borderWidth: 0,
  },
  nestedEditor: {
    paddingBlock: 8,
    paddingInlineStart: 12,
    paddingInlineEnd: 0,
    borderWidth: 0,
    borderInlineStartWidth: 1,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: "var(--border)",
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minWidth: 0,
  },
  conditionList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    listStyleType: "none",
    padding: 0,
    margin: 0,
    minWidth: 0,
  },
  listItem: { minWidth: 0 },
  conditionRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 4,
    padding: 4,
    margin: 0,
    borderWidth: 0,
    minWidth: 0,
    borderRadius: 8,
    backgroundColor: "var(--surface-secondary)",
  },
  rowButton: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    paddingInline: 8,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    minWidth: 0,
    width: "100%",
    minHeight: { default: 36, "@media (pointer: coarse)": 44 },
  },
  rowField: { fontWeight: 500 },
  rowRule: { color: "var(--muted)" },
  inlineEditor: {
    padding: 12,
    minWidth: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
  },
  groupAdd: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    borderWidth: 0,
    padding: 0,
    margin: 0,
    minWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    paddingTop: 12,
  },
  emptyGroup: { fontSize: 14, color: "var(--muted)", margin: 0 },
  popup: {
    display: "flex",
    flexDirection: "column",
    width: 480,
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "min(720px, calc(100dvh - 96px))",
    overflow: "visible",
    padding: 0,
    borderRadius: 16,
  },
  panelHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  },
  panelTitle: { fontSize: 15, fontWeight: 600, margin: 0 },
  panelDescription: {
    fontSize: 12,
    color: "var(--muted)",
    lineHeight: 1.5,
    marginTop: 4,
    marginBottom: 0,
  },
  fieldLabel: { fontSize: 12, fontWeight: 500, color: "var(--muted)" },
  editorField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  editorValue: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
    gridColumn: "1 / -1",
  },
  valueRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  panelFooter: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: 16,
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
  },
  footerActions: { display: "flex", gap: 8, marginInlineStart: "auto" },
  root: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    width: "max-content",
    maxWidth: "100%",
    minWidth: 0,
    padding: 0,
    margin: 0,
    borderWidth: 0,
  },
  editor: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    borderWidth: 0,
    padding: 0,
    margin: 0,
    minWidth: 0,
    maxWidth: "100%",
  },
  editorRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 12,
    minWidth: 0,
  },
  control: {
    minHeight: { default: 36, "@media (pointer: coarse)": 44 },
    maxWidth: "100%",
  },
  value: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 120,
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    minHeight: { default: 36, "@media (pointer: coarse)": 44 },
  },
  error: { color: "var(--danger)", marginBlock: 8, fontSize: 14 },
});
