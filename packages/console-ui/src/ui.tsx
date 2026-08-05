/* eslint-disable func-style, jsx-a11y/prefer-tag-over-role */

import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type ClassValue = string | false | null | undefined;

const classes = (...values: ClassValue[]) => values.filter(Boolean).join(" ");

type ConsolePageProps = PropsWithChildren<
  ComponentPropsWithoutRef<"main"> & { scroll?: boolean }
>;

function ConsolePageRoot({
  children,
  className,
  scroll = true,
  ...props
}: ConsolePageProps) {
  return (
    <main
      className={classes("lenso-ui-page", className)}
      data-scroll={scroll ? "true" : "false"}
      {...props}
    >
      {children}
    </main>
  );
}

function ConsolePageHeader({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"header">>) {
  return (
    <header className={classes("lenso-ui-page__header", className)} {...props}>
      {children}
    </header>
  );
}

function ConsolePageHeading({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"div">>) {
  return (
    <div className={classes("lenso-ui-page__heading", className)} {...props}>
      {children}
    </div>
  );
}

function ConsolePageEyebrow({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"p">>) {
  return (
    <p className={classes("lenso-ui-page__eyebrow", className)} {...props}>
      {children}
    </p>
  );
}

function ConsolePageTitle({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"h1">>) {
  return (
    <h1 className={classes("lenso-ui-page__title", className)} {...props}>
      {children}
    </h1>
  );
}

function ConsolePageDescription({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"p">>) {
  return (
    <p className={classes("lenso-ui-page__description", className)} {...props}>
      {children}
    </p>
  );
}

function ConsolePageActions({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"div">>) {
  return (
    <div className={classes("lenso-ui-page__actions", className)} {...props}>
      {children}
    </div>
  );
}

function ConsolePageBody({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"div">>) {
  return (
    <div className={classes("lenso-ui-page__body", className)} {...props}>
      {children}
    </div>
  );
}

export const ConsolePage = Object.assign(ConsolePageRoot, {
  Actions: ConsolePageActions,
  Body: ConsolePageBody,
  Description: ConsolePageDescription,
  Eyebrow: ConsolePageEyebrow,
  Header: ConsolePageHeader,
  Heading: ConsolePageHeading,
  Title: ConsolePageTitle,
});

export type ButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "ghost"
  | "danger";
export type ControlSize = "sm" | "md";

export type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: ControlSize;
    variant?: ButtonVariant;
  }
>;

export function Button({
  children,
  className,
  size = "sm",
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={classes("lenso-ui-button", className)}
      data-size={size}
      data-variant={variant === "default" ? "secondary" : variant}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonProps, "aria-label"> & {
  label: string;
};

export function IconButton({
  children,
  className,
  label,
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      className={classes("lenso-ui-icon-button", className)}
      title={props.title ?? label}
      {...props}
    >
      {children}
    </Button>
  );
}

export type SemanticTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type BadgeProps = PropsWithChildren<
  ComponentPropsWithoutRef<"span"> & { tone?: SemanticTone }
>;

export function Badge({
  children,
  className,
  tone = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={classes("lenso-ui-badge", className)}
      data-tone={tone}
      {...props}
    >
      {children}
    </span>
  );
}

export type StatusMarkerProps = PropsWithChildren<
  ComponentPropsWithoutRef<"span"> & {
    align?: "center" | "top";
    tone?: SemanticTone;
  }
>;

export type IconSlotSize = 12 | 16 | 20;

export type IconSlotProps = PropsWithChildren<
  ComponentPropsWithoutRef<"span"> & { size?: IconSlotSize }
>;

export function IconSlot({
  children,
  className,
  size = 16,
  ...props
}: IconSlotProps) {
  return (
    <span
      className={classes("lenso-ui-icon-slot", className)}
      data-size={size}
      {...props}
    >
      {children}
    </span>
  );
}

export type InlineStatusProps = PropsWithChildren<
  ComponentPropsWithoutRef<"span"> & {
    align?: "center" | "first-line" | "top";
    tone?: SemanticTone;
  }
>;

function InlineStatusMarkup({
  align = "center",
  children,
  className,
  tone = "neutral",
  ...props
}: InlineStatusProps) {
  return (
    <span
      className={classes("lenso-ui-inline-status", className)}
      data-align={align}
      data-tone={tone}
      {...props}
    >
      <span aria-hidden="true" className="lenso-ui-inline-status__dot" />
      <span className="lenso-ui-inline-status__label">{children}</span>
    </span>
  );
}

export function InlineStatus({
  align = "center",
  children,
  className,
  tone = "neutral",
  ...props
}: InlineStatusProps) {
  return InlineStatusMarkup({
    align,
    children,
    className,
    tone,
    ...props,
  });
}

export function StatusMarker({
  align = "center",
  children,
  className,
  tone = "neutral",
  ...props
}: StatusMarkerProps) {
  return InlineStatusMarkup({
    align,
    children,
    className: classes("lenso-ui-status", className),
    tone,
    ...props,
  });
}

export type FilterControlProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode }
>;

export function FilterControl({
  children,
  className,
  icon,
  type = "button",
  ...props
}: FilterControlProps) {
  return (
    <button
      className={classes("lenso-ui-filter-control", className)}
      type={type}
      {...props}
    >
      <span className="lenso-ui-filter-control__label">{children}</span>
      {icon ? <IconSlot size={12}>{icon}</IconSlot> : null}
    </button>
  );
}

export type PaneHeaderProps = PropsWithChildren<
  ComponentPropsWithoutRef<"header"> & {
    meta?: ReactNode;
    title?: ReactNode;
  }
>;

export function PaneHeader({
  children,
  className,
  meta,
  title,
  ...props
}: PaneHeaderProps) {
  return (
    <header className={classes("lenso-ui-pane-header", className)} {...props}>
      <span className="lenso-ui-pane-header__title">{title ?? children}</span>
      {meta === undefined ? null : (
        <span className="lenso-ui-pane-header__meta">{meta}</span>
      )}
    </header>
  );
}

export type SurfaceGroupLabelProps = PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    icon?: ReactNode;
    label: ReactNode;
  }
>;

export function SurfaceGroupLabel({
  children,
  className,
  icon,
  label,
  ...props
}: SurfaceGroupLabelProps) {
  return (
    <div
      className={classes("lenso-ui-surface-group-label", className)}
      {...props}
    >
      {icon ? <IconSlot size={16}>{icon}</IconSlot> : null}
      <span className="lenso-ui-surface-group-label__text">{label}</span>
      {children}
    </div>
  );
}

export type ConsoleTableVariant = "generic" | "provider" | "runtime";

export type TableHeaderProps = ComponentPropsWithoutRef<"div"> & {
  columns?: readonly ReactNode[];
  variant?: ConsoleTableVariant;
};

const defaultTableColumns = ["Capability", "Kind", "Owner", "State"] as const;

export function TableHeader({
  children,
  className,
  columns = defaultTableColumns,
  variant = "generic",
  ...props
}: TableHeaderProps) {
  const labels = children ? [children] : columns;
  return (
    <div
      className={classes("lenso-ui-table-header", className)}
      data-variant={variant}
      role="row"
      {...props}
    >
      {labels.map((column, index) => (
        <span
          className="lenso-ui-table-header__cell"
          key={`table-header-${index}`}
        >
          {column}
        </span>
      ))}
    </div>
  );
}

export type DataRowProps = PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    cells?: readonly ReactNode[];
    column2?: ReactNode;
    column3?: ReactNode;
    interactive?: boolean;
    primary?: ReactNode;
    secondary?: ReactNode;
    selected?: boolean;
    status?: ReactNode;
    variant?: ConsoleTableVariant;
    onActivate?: () => void;
  }
>;

export function DataRow({
  cells,
  children,
  className,
  column2,
  column3,
  interactive = false,
  onClick,
  onActivate,
  onKeyDown,
  primary,
  secondary,
  selected = false,
  status,
  variant = "generic",
  ...props
}: DataRowProps) {
  const trailingCells = cells ?? [column2, column3, status ?? children];
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      interactive &&
      onActivate &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      onActivate();
    }
    onKeyDown?.(event);
  };
  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (interactive && onActivate) {
      onActivate();
    }
    onClick?.(event);
  };

  return (
    <div
      className={classes("lenso-ui-data-row", className)}
      aria-selected={selected}
      data-selected={selected ? "true" : "false"}
      data-variant={variant}
      role="row"
      tabIndex={interactive ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...props}
    >
      <span className="lenso-ui-data-row__primary">
        <strong>{primary}</strong>
        {secondary === undefined ? null : <small>{secondary}</small>}
      </span>
      {trailingCells.map((cell, index) => (
        <span className="lenso-ui-data-row__cell" key={`data-row-${index}`}>
          {cell}
        </span>
      ))}
    </div>
  );
}

function PanelRoot({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"section">>) {
  return (
    <section className={classes("lenso-ui-panel", className)} {...props}>
      {children}
    </section>
  );
}

function PanelHeader({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"header">>) {
  return (
    <header className={classes("lenso-ui-panel__header", className)} {...props}>
      {children}
    </header>
  );
}

function PanelTitle({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"h2">>) {
  return (
    <h2 className={classes("lenso-ui-panel__title", className)} {...props}>
      {children}
    </h2>
  );
}

function PanelDescription({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"p">>) {
  return (
    <p className={classes("lenso-ui-panel__description", className)} {...props}>
      {children}
    </p>
  );
}

function PanelContent({
  children,
  className,
  padding = "none",
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & { padding?: "none" | "sm" | "md" }
>) {
  return (
    <div
      className={classes("lenso-ui-panel__content", className)}
      data-padding={padding}
      {...props}
    >
      {children}
    </div>
  );
}

export const Panel = Object.assign(PanelRoot, {
  Content: PanelContent,
  Description: PanelDescription,
  Header: PanelHeader,
  Title: PanelTitle,
});

function SummaryStripRoot({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"div">>) {
  return (
    <div className={classes("lenso-ui-summary", className)} {...props}>
      {children}
    </div>
  );
}

function SummaryStripItem({
  children,
  className,
  label,
  note,
  tone = "neutral",
  value,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    label: ReactNode;
    note?: ReactNode;
    tone?: SemanticTone;
    value: ReactNode;
  }
>) {
  return (
    <div
      className={classes("lenso-ui-summary__item", className)}
      data-tone={tone}
      {...props}
    >
      <span className="lenso-ui-summary__label">{label}</span>
      <strong className="lenso-ui-summary__value">{value}</strong>
      {note ? <span className="lenso-ui-summary__note">{note}</span> : null}
      {children}
    </div>
  );
}

export const SummaryStrip = Object.assign(SummaryStripRoot, {
  Item: SummaryStripItem,
});

function SplitViewRoot({
  children,
  className,
  inset = "default",
  inspectorWidth,
  style,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    inset?: "default" | "none";
    inspectorWidth?: number;
  }
>) {
  return (
    <div
      className={classes("lenso-ui-split-view", className)}
      data-inset={inset}
      style={{
        ...style,
        ...(inspectorWidth
          ? { gridTemplateColumns: `minmax(0, 1fr) ${inspectorWidth}px` }
          : {}),
      }}
      {...props}
    >
      {children}
    </div>
  );
}

function SplitViewMain({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"section">>) {
  return (
    <section
      className={classes("lenso-ui-split-view__main", className)}
      {...props}
    >
      {children}
    </section>
  );
}

function SplitViewInspector({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"aside">>) {
  return (
    <aside
      className={classes("lenso-ui-split-view__inspector", className)}
      {...props}
    >
      {children}
    </aside>
  );
}

export const SplitView = Object.assign(SplitViewRoot, {
  Inspector: SplitViewInspector,
  Main: SplitViewMain,
});

export type InspectorProps = PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    headerAction?: ReactNode;
    status?: ReactNode;
    subtitle?: ReactNode;
    title?: ReactNode;
  }
>;

function InspectorRoot({
  children,
  className,
  headerAction,
  status,
  subtitle,
  title,
  ...props
}: InspectorProps) {
  return (
    <div className={classes("lenso-ui-inspector", className)} {...props}>
      {title === undefined &&
      subtitle === undefined &&
      !status &&
      !headerAction ? null : (
        <header
          className="lenso-ui-inspector__header"
          data-has-action={headerAction ? "true" : undefined}
        >
          <div className="lenso-ui-inspector__header-content">
            {title === undefined ? null : (
              <h2 className="lenso-ui-inspector__title">{title}</h2>
            )}
            {subtitle === undefined ? null : (
              <p className="lenso-ui-inspector__subtitle">{subtitle}</p>
            )}
            {status ? (
              <div className="lenso-ui-inspector__status">{status}</div>
            ) : null}
          </div>
          {headerAction ? (
            <div className="lenso-ui-inspector__header-action">
              {headerAction}
            </div>
          ) : null}
        </header>
      )}
      {children}
    </div>
  );
}

function InspectorSection({
  children,
  className,
  title,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"section"> & { title?: ReactNode }
>) {
  return (
    <section
      className={classes("lenso-ui-inspector__section", className)}
      {...props}
    >
      {title === undefined ? null : (
        <h3 className="lenso-ui-inspector__section-title">{title}</h3>
      )}
      <div className="lenso-ui-inspector__section-body">{children}</div>
    </section>
  );
}

function InspectorActions({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"div">>) {
  return (
    <div
      className={classes("lenso-ui-inspector__actions", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export const Inspector = Object.assign(InspectorRoot, {
  Actions: InspectorActions,
  Section: InspectorSection,
});

function SectionRoot({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"section">>) {
  return (
    <section className={classes("lenso-ui-section", className)} {...props}>
      {children}
    </section>
  );
}

function SectionHeader({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"header">>) {
  return (
    <header
      className={classes("lenso-ui-section__header", className)}
      {...props}
    >
      {children}
    </header>
  );
}

function SectionTitle({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"h2">>) {
  return (
    <h2 className={classes("lenso-ui-section__title", className)} {...props}>
      {children}
    </h2>
  );
}

function SectionMeta({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"span">>) {
  return (
    <span className={classes("lenso-ui-section__meta", className)} {...props}>
      {children}
    </span>
  );
}

function SectionBody({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"div">>) {
  return (
    <div className={classes("lenso-ui-section__body", className)} {...props}>
      {children}
    </div>
  );
}

export const Section = Object.assign(SectionRoot, {
  Body: SectionBody,
  Header: SectionHeader,
  Meta: SectionMeta,
  Title: SectionTitle,
});

function KeyValueListRoot({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"dl">>) {
  return (
    <dl className={classes("lenso-ui-key-values", className)} {...props}>
      {children}
    </dl>
  );
}

function KeyValueListRow({
  className,
  label,
  value,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className={classes("lenso-ui-key-values__row", className)} {...props}>
      <dt className="lenso-ui-key-values__label">{label}</dt>
      <dd className="lenso-ui-key-values__value">{value}</dd>
    </div>
  );
}

export const KeyValueList = Object.assign(KeyValueListRoot, {
  Row: KeyValueListRow,
});

export function StateView({
  action,
  className,
  description,
  icon,
  title,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  action?: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className={classes("lenso-ui-state", className)} {...props}>
      {icon ? <span className="lenso-ui-state__icon">{icon}</span> : null}
      <strong className="lenso-ui-state__title">{title}</strong>
      <p className="lenso-ui-state__description">{description}</p>
      {action ? <div className="lenso-ui-state__action">{action}</div> : null}
    </div>
  );
}

function TabsRoot({
  children,
  className,
  density = "default",
  inset = "default",
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    density?: "default" | "page" | "inspector";
    inset?: "default" | "none" | "sm";
  }
>) {
  return (
    <div
      className={classes("lenso-ui-tabs", className)}
      data-density={density}
      data-inset={inset}
      {...props}
    >
      {children}
    </div>
  );
}

function TabsList({
  children,
  className,
  inset,
  leadingIcon,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    inset?: "default" | "none" | "sm";
    leadingIcon?: boolean;
  }
>) {
  return (
    <div
      className={classes("lenso-ui-tabs__list", className)}
      data-inset={inset}
      data-leading={leadingIcon ? "icon" : undefined}
      role="tablist"
      {...props}
    >
      {children}
    </div>
  );
}

function TabsTab({
  children,
  className,
  onKeyDown,
  selected,
  type = "button",
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }
>) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }

    const tabs = [
      ...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]'
      ) ?? []),
    ];
    const currentIndex = tabs.indexOf(event.currentTarget);
    if (currentIndex === -1 || tabs.length < 2) {
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };

  return (
    <button
      aria-selected={selected}
      className={classes("lenso-ui-tabs__tab", className)}
      role="tab"
      type={type}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </button>
  );
}

function TabsPanel({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"div">>) {
  return (
    <div
      className={classes("lenso-ui-tabs__panel", className)}
      role="tabpanel"
      {...props}
    >
      {children}
    </div>
  );
}

export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Panel: TabsPanel,
  Tab: TabsTab,
});

function SettingsGroupRoot({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"section">>) {
  return (
    <section
      className={classes("lenso-ui-settings-group", className)}
      {...props}
    >
      {children}
    </section>
  );
}

function SettingsGroupHeader({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"header">>) {
  return (
    <header
      className={classes("lenso-ui-settings-group__header", className)}
      {...props}
    >
      {children}
    </header>
  );
}

function SettingsGroupTitle({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"h2">>) {
  return (
    <h2
      className={classes("lenso-ui-settings-group__title", className)}
      {...props}
    >
      {children}
    </h2>
  );
}

function SettingsGroupDescription({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"p">>) {
  return (
    <p
      className={classes("lenso-ui-settings-group__description", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export const SettingsGroup = Object.assign(SettingsGroupRoot, {
  Description: SettingsGroupDescription,
  Header: SettingsGroupHeader,
  Title: SettingsGroupTitle,
});

export function SettingsRow({
  children,
  className,
  description,
  label,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    description?: ReactNode;
    label: ReactNode;
  }
>) {
  return (
    <div className={classes("lenso-ui-settings-row", className)} {...props}>
      <div className="lenso-ui-settings-row__copy">
        <div className="lenso-ui-settings-row__label">{label}</div>
        {description ? (
          <div className="lenso-ui-settings-row__description">
            {description}
          </div>
        ) : null}
      </div>
      <div className="lenso-ui-settings-row__control">{children}</div>
    </div>
  );
}

function FieldRoot({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"div">>) {
  return (
    <div className={classes("lenso-ui-field", className)} {...props}>
      {children}
    </div>
  );
}

function FieldLabel({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"label">>) {
  return (
    <label className={classes("lenso-ui-field__label", className)} {...props}>
      {children}
    </label>
  );
}

function FieldHint({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"p">>) {
  return (
    <p className={classes("lenso-ui-field__hint", className)} {...props}>
      {children}
    </p>
  );
}

function FieldError({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"p">>) {
  return (
    <p
      className={classes("lenso-ui-field__error", className)}
      role="alert"
      {...props}
    >
      {children}
    </p>
  );
}

export const Field = Object.assign(FieldRoot, {
  Error: FieldError,
  Hint: FieldHint,
  Label: FieldLabel,
});

export function Input({
  className,
  ...props
}: ComponentPropsWithoutRef<"input">) {
  return <input className={classes("lenso-ui-input", className)} {...props} />;
}

export function Select({
  children,
  className,
  ...props
}: PropsWithChildren<SelectHTMLAttributes<HTMLSelectElement>>) {
  return (
    <select className={classes("lenso-ui-select", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={classes("lenso-ui-textarea", className)} {...props} />
  );
}

function EmptyStateRoot({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"div">>) {
  return (
    <div className={classes("lenso-ui-empty-state", className)} {...props}>
      {children}
    </div>
  );
}

function EmptyStateIcon({ children }: { children: ReactNode }) {
  return <div className="lenso-ui-empty-state__icon">{children}</div>;
}

function EmptyStateTitle({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"h2">>) {
  return (
    <h2
      className={classes("lenso-ui-empty-state__title", className)}
      {...props}
    >
      {children}
    </h2>
  );
}

function EmptyStateDescription({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"p">>) {
  return (
    <p
      className={classes("lenso-ui-empty-state__description", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export const EmptyState = Object.assign(EmptyStateRoot, {
  Description: EmptyStateDescription,
  Icon: EmptyStateIcon,
  Title: EmptyStateTitle,
});

function DataTableRoot({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"table">>) {
  return (
    <div className="lenso-ui-table-wrap">
      <table className={classes("lenso-ui-table", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

function DataTableHead({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"thead">>) {
  return (
    <thead className={classes("lenso-ui-table__head", className)} {...props}>
      {children}
    </thead>
  );
}

function DataTableBody({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"tbody">>) {
  return (
    <tbody className={classes("lenso-ui-table__body", className)} {...props}>
      {children}
    </tbody>
  );
}

function DataTableRow({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"tr">>) {
  return (
    <tr className={classes("lenso-ui-table__row", className)} {...props}>
      {children}
    </tr>
  );
}

function DataTableHeader({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"th">>) {
  return (
    <th className={classes("lenso-ui-table__header", className)} {...props}>
      {children}
    </th>
  );
}

function DataTableCell({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"td">>) {
  return (
    <td className={classes("lenso-ui-table__cell", className)} {...props}>
      {children}
    </td>
  );
}

export const DataTable = Object.assign(DataTableRoot, {
  Body: DataTableBody,
  Cell: DataTableCell,
  Head: DataTableHead,
  Header: DataTableHeader,
  Row: DataTableRow,
});

export interface ConsoleUiComponents {
  Badge: typeof Badge;
  Button: typeof Button;
  ConsolePage: typeof ConsolePage;
  DataRow: typeof DataRow;
  DataTable: typeof DataTable;
  EmptyState: typeof EmptyState;
  Field: typeof Field;
  FilterControl: typeof FilterControl;
  IconButton: typeof IconButton;
  IconSlot: typeof IconSlot;
  Input: typeof Input;
  InlineStatus: typeof InlineStatus;
  Inspector: typeof Inspector;
  KeyValueList: typeof KeyValueList;
  Panel: typeof Panel;
  PaneHeader: typeof PaneHeader;
  Section: typeof Section;
  Select: typeof Select;
  SettingsGroup: typeof SettingsGroup;
  SettingsRow: typeof SettingsRow;
  SurfaceGroupLabel: typeof SurfaceGroupLabel;
  StatusMarker: typeof StatusMarker;
  StateView: typeof StateView;
  SummaryStrip: typeof SummaryStrip;
  SplitView: typeof SplitView;
  TableHeader: typeof TableHeader;
  Tabs: typeof Tabs;
  Textarea: typeof Textarea;
}

export const consoleUi: ConsoleUiComponents = {
  Badge,
  Button,
  ConsolePage,
  DataRow,
  DataTable,
  EmptyState,
  Field,
  FilterControl,
  IconButton,
  IconSlot,
  InlineStatus,
  Input,
  Inspector,
  KeyValueList,
  PaneHeader,
  Panel,
  Section,
  Select,
  SettingsGroup,
  SettingsRow,
  SplitView,
  StateView,
  StatusMarker,
  SummaryStrip,
  SurfaceGroupLabel,
  TableHeader,
  Tabs,
  Textarea,
};
