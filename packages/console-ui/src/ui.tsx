/* eslint-disable func-style, jsx-a11y/prefer-tag-over-role, no-negated-condition, sort-keys */

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
import { createContext, useContext } from "react";

import { mergeStyleProps, styles } from "./styles.js";
import type { ConsoleStyle } from "./styles.js";

type ClassValue = string | false | null | undefined;

const classes = (...values: ClassValue[]) => values.filter(Boolean).join(" ");

export type ConsoleSurfaceRootProps = PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    moduleId?: string;
    surfaceId?: string;
    stylex?: ConsoleStyle;
  }
>;

/** Stable root node for Module Surface styling and Figma-frame targeting. */
export function SurfaceRoot({
  children,
  className,
  moduleId,
  stylex: stylexStyle,
  surfaceId,
  ...props
}: ConsoleSurfaceRootProps) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-surface-root", className),
        styles.surfaceRoot
      )}
      data-lenso-surface-root="true"
      data-module-id={moduleId}
      data-surface-id={surfaceId}
      {...props}
    >
      {children}
    </div>
  );
}

type ConsolePageProps = PropsWithChildren<
  ComponentPropsWithoutRef<"main"> & {
    scroll?: boolean;
    stylex?: ConsoleStyle;
  }
>;

function ConsolePageRoot({
  children,
  className,
  scroll = true,
  stylex: stylexStyle,
  ...props
}: ConsolePageProps) {
  return (
    <main
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-page", className),
        styles.page
      )}
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
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"header"> & { stylex?: ConsoleStyle }
>) {
  return (
    <header
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-page__header", className),
        styles.pageHeader
      )}
      {...props}
    >
      {children}
    </header>
  );
}

function ConsolePageHeading({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & { stylex?: ConsoleStyle }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-page__heading", className),
        styles.pageHeading
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function ConsolePageEyebrow({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"p"> & { stylex?: ConsoleStyle }
>) {
  return (
    <p
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-page__eyebrow", className),
        styles.pageEyebrow
      )}
      {...props}
    >
      {children}
    </p>
  );
}

function ConsolePageTitle({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"h1"> & { stylex?: ConsoleStyle }
>) {
  return (
    <h1
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-page__title", className),
        styles.pageTitle
      )}
      {...props}
    >
      {children}
    </h1>
  );
}

function ConsolePageDescription({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"p"> & { stylex?: ConsoleStyle }
>) {
  return (
    <p
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-page__description", className),
        styles.pageDescription
      )}
      {...props}
    >
      {children}
    </p>
  );
}

function ConsolePageActions({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & { stylex?: ConsoleStyle }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-page__actions", className),
        styles.pageActions
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function ConsolePageBody({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & { stylex?: ConsoleStyle }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-page__body", className),
        styles.pageBody
      )}
      {...props}
    >
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
    stylex?: ConsoleStyle;
    variant?: ButtonVariant;
  }
>;

export function Button({
  children,
  className,
  size = "sm",
  stylex: stylexStyle,
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-button", className),
        styles.button,
        size === "md" ? styles.buttonMd : null,
        variant === "primary" ? styles.buttonPrimary : null,
        variant === "ghost" ? styles.buttonGhost : null,
        variant === "danger" ? styles.buttonDanger : null
      )}
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
  stylex: stylexStyle,
  size = "sm",
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      className={classes("lenso-ui-icon-button", className)}
      size={size}
      stylex={[
        stylexStyle,
        size === "md" ? styles.iconButtonMd : styles.iconButton,
      ]}
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
  ComponentPropsWithoutRef<"span"> & {
    stylex?: ConsoleStyle;
    tone?: SemanticTone;
  }
>;

export function Badge({
  children,
  className,
  stylex: stylexStyle,
  tone = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-badge", className),
        styles.badge,
        tone === "info" ? styles.badgeInfo : null,
        tone === "success" ? styles.badgeSuccess : null,
        tone === "warning" ? styles.badgeWarning : null,
        tone === "danger" ? styles.badgeDanger : null
      )}
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
  ComponentPropsWithoutRef<"span"> & {
    size?: IconSlotSize;
    stylex?: ConsoleStyle;
  }
>;

export function IconSlot({
  children,
  className,
  size = 16,
  stylex: stylexStyle,
  ...props
}: IconSlotProps) {
  return (
    <span
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-icon-slot", className),
        styles.iconSlot,
        size === 12 ? styles.iconSlot12 : null,
        size === 20 ? styles.iconSlot20 : null
      )}
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
      {...mergeStyleProps(
        undefined,
        classes("lenso-ui-inline-status", className),
        styles.inlineStatus,
        align !== "center" ? styles.inlineStatusTop : null
      )}
      data-align={align}
      data-tone={tone}
      {...props}
    >
      <span
        {...mergeStyleProps(
          undefined,
          "lenso-ui-inline-status__dot",
          styles.inlineStatusDot,
          align !== "center" ? styles.inlineStatusDotTop : null,
          tone === "info" ? styles.inlineStatusDotInfo : null,
          tone === "success" ? styles.inlineStatusDotSuccess : null,
          tone === "warning" ? styles.inlineStatusDotWarning : null,
          tone === "danger" ? styles.inlineStatusDotDanger : null
        )}
        aria-hidden="true"
      />
      <span
        {...mergeStyleProps(
          undefined,
          "lenso-ui-inline-status__label",
          styles.inlineStatusLabel
        )}
      >
        {children}
      </span>
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
      {...mergeStyleProps(
        undefined,
        classes("lenso-ui-filter-control", className),
        styles.filterControl
      )}
      type={type}
      {...props}
    >
      <span
        {...mergeStyleProps(
          undefined,
          "lenso-ui-filter-control__label",
          styles.filterControlLabel
        )}
      >
        {children}
      </span>
      {icon ? <IconSlot size={12}>{icon}</IconSlot> : null}
    </button>
  );
}

export type FilterSelectProps = PropsWithChildren<
  SelectHTMLAttributes<HTMLSelectElement> & {
    icon: ReactNode;
    selectClassName?: string;
    stylex?: ConsoleStyle;
  }
>;

export function FilterSelect({
  children,
  className,
  icon,
  selectClassName,
  stylex: stylexStyle,
  ...props
}: FilterSelectProps) {
  return (
    <label
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-filter-select", className),
        styles.filterSelectRoot
      )}
    >
      <select
        {...mergeStyleProps(
          undefined,
          classes("lenso-ui-filter-select__select", selectClassName),
          styles.filterSelect
        )}
        {...props}
      >
        {children}
      </select>
      <IconSlot aria-hidden="true" size={12} stylex={styles.filterSelectIcon}>
        {icon}
      </IconSlot>
    </label>
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
    <header
      {...mergeStyleProps(
        undefined,
        classes("lenso-ui-pane-header", className),
        styles.paneHeader
      )}
      {...props}
    >
      <span
        {...mergeStyleProps(
          undefined,
          "lenso-ui-pane-header__title",
          styles.paneHeaderTitle
        )}
      >
        {title ?? children}
      </span>
      {meta === undefined ? null : (
        <span
          {...mergeStyleProps(
            undefined,
            "lenso-ui-pane-header__meta",
            styles.paneHeaderMeta
          )}
        >
          {meta}
        </span>
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
      {...mergeStyleProps(
        undefined,
        classes("lenso-ui-surface-group-label", className),
        styles.surfaceGroupLabel
      )}
      {...props}
    >
      {icon ? <IconSlot size={16}>{icon}</IconSlot> : null}
      <span
        {...mergeStyleProps(
          undefined,
          "lenso-ui-surface-group-label__text",
          styles.surfaceGroupLabelText
        )}
      >
        {label}
      </span>
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
      {...mergeStyleProps(
        undefined,
        classes("lenso-ui-table-header", className),
        styles.tableHeader,
        variant === "provider" ? styles.tableHeaderProvider : null,
        variant === "runtime" ? styles.tableHeaderRuntime : null
      )}
      data-variant={variant}
      role="row"
      {...props}
    >
      {labels.map((column, index) => (
        <span
          {...mergeStyleProps(
            undefined,
            "lenso-ui-table-header__cell",
            styles.tableHeaderCell,
            index === 0 ? styles.tableHeaderCellFirst : null
          )}
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
      {...mergeStyleProps(
        undefined,
        classes("lenso-ui-data-row", className),
        styles.dataRow,
        variant === "provider" ? styles.dataRowProvider : null,
        variant === "runtime" ? styles.dataRowRuntime : null,
        selected ? styles.dataRowSelected : null,
        interactive ? (styles.dataRowInteractive as ConsoleStyle) : null
      )}
      aria-selected={selected}
      data-selected={selected ? "true" : "false"}
      data-variant={variant}
      role="row"
      tabIndex={interactive ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...props}
    >
      <span
        {...mergeStyleProps(
          undefined,
          "lenso-ui-data-row__primary",
          styles.dataRowPrimary
        )}
      >
        <strong
          {...mergeStyleProps(undefined, undefined, styles.dataRowPrimaryText)}
        >
          {primary}
        </strong>
        {secondary === undefined ? null : (
          <small
            {...mergeStyleProps(
              undefined,
              undefined,
              styles.dataRowSecondaryText
            )}
          >
            {secondary}
          </small>
        )}
      </span>
      {trailingCells.map((cell, index) => (
        <span
          {...mergeStyleProps(
            undefined,
            "lenso-ui-data-row__cell",
            styles.dataRowCell
          )}
          key={`data-row-${index}`}
        >
          {cell}
        </span>
      ))}
    </div>
  );
}

export type DataGridProps = PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & { stylex?: ConsoleStyle }
>;

/** Scrollable table surface used by official and third-party Module Surfaces. */
export function DataGrid({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: DataGridProps) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-data-grid", className),
        styles.dataGrid
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function PanelRoot({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"section"> & { stylex?: ConsoleStyle }
>) {
  return (
    <section
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-panel", className),
        styles.panel
      )}
      {...props}
    >
      {children}
    </section>
  );
}

function PanelHeader({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"header"> & { stylex?: ConsoleStyle }
>) {
  return (
    <header
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-panel__header", className),
        styles.panelHeader
      )}
      {...props}
    >
      {children}
    </header>
  );
}

function PanelTitle({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"h2"> & { stylex?: ConsoleStyle }
>) {
  return (
    <h2
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-panel__title", className),
        styles.panelTitle
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

function PanelDescription({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"p"> & { stylex?: ConsoleStyle }
>) {
  return (
    <p
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-panel__description", className),
        styles.panelDescription
      )}
      {...props}
    >
      {children}
    </p>
  );
}

function PanelContent({
  children,
  className,
  padding = "none",
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    padding?: "none" | "sm" | "md";
    stylex?: ConsoleStyle;
  }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-panel__content", className),
        padding === "sm" ? styles.panelContentSm : null,
        padding === "md" ? styles.panelContentMd : null
      )}
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
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & { stylex?: ConsoleStyle }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-summary", className),
        styles.summary
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function SummaryStripItem({
  children,
  className,
  label,
  note,
  stylex: stylexStyle,
  tone = "neutral",
  value,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    label: ReactNode;
    note?: ReactNode;
    stylex?: ConsoleStyle;
    tone?: SemanticTone;
    value: ReactNode;
  }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-summary__item", className),
        styles.summaryItem
      )}
      data-tone={tone}
      {...props}
    >
      <span
        {...mergeStyleProps(
          undefined,
          "lenso-ui-summary__label",
          styles.summaryLabel
        )}
      >
        {label}
      </span>
      <strong
        {...mergeStyleProps(
          undefined,
          "lenso-ui-summary__value",
          styles.summaryValue,
          tone === "warning" ? styles.summaryValueWarning : null,
          tone === "danger" ? styles.summaryValueDanger : null,
          tone === "success" ? styles.summaryValueSuccess : null
        )}
      >
        {value}
      </strong>
      {note ? (
        <span
          {...mergeStyleProps(
            undefined,
            "lenso-ui-summary__note",
            styles.summaryNote
          )}
        >
          {note}
        </span>
      ) : null}
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
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    inset?: "default" | "none";
    inspectorWidth?: number;
    stylex?: ConsoleStyle;
  }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-split-view", className),
        styles.splitView,
        inset === "none" ? styles.splitViewNone : null
      )}
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
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"section"> & { stylex?: ConsoleStyle }
>) {
  return (
    <section
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-split-view__main", className),
        styles.splitViewPane,
        styles.splitViewMain
      )}
      {...props}
    >
      {children}
    </section>
  );
}

function SplitViewInspector({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"aside"> & { stylex?: ConsoleStyle }
>) {
  return (
    <aside
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-split-view__inspector", className),
        styles.splitViewPane,
        styles.splitViewInspector
      )}
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
  stylex: stylexStyle,
  ...props
}: InspectorProps & { stylex?: ConsoleStyle }) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-inspector", className),
        styles.inspector
      )}
      {...props}
    >
      {title === undefined &&
      subtitle === undefined &&
      !status &&
      !headerAction ? null : (
        <header
          {...mergeStyleProps(
            undefined,
            "lenso-ui-inspector__header",
            styles.inspectorHeader,
            headerAction ? styles.inspectorHeaderWithAction : null
          )}
          data-has-action={headerAction ? "true" : undefined}
        >
          <div
            {...mergeStyleProps(
              undefined,
              "lenso-ui-inspector__header-content",
              styles.inspectorHeaderContent
            )}
          >
            {title === undefined ? null : (
              <h2
                {...mergeStyleProps(
                  undefined,
                  "lenso-ui-inspector__title",
                  styles.inspectorTitle
                )}
              >
                {title}
              </h2>
            )}
            {subtitle === undefined ? null : (
              <p
                {...mergeStyleProps(
                  undefined,
                  "lenso-ui-inspector__subtitle",
                  styles.inspectorSubtitle
                )}
              >
                {subtitle}
              </p>
            )}
            {status ? (
              <div
                {...mergeStyleProps(
                  undefined,
                  "lenso-ui-inspector__status",
                  styles.inspectorStatus
                )}
              >
                {status}
              </div>
            ) : null}
          </div>
          {headerAction ? (
            <div
              {...mergeStyleProps(
                undefined,
                "lenso-ui-inspector__header-action",
                styles.inspectorHeaderAction
              )}
            >
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
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"section"> & {
    title?: ReactNode;
    stylex?: ConsoleStyle;
  }
>) {
  return (
    <section
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-inspector__section", className),
        styles.inspectorSection
      )}
      {...props}
    >
      {title === undefined ? null : (
        <h3
          {...mergeStyleProps(
            undefined,
            "lenso-ui-inspector__section-title",
            styles.inspectorSectionTitle
          )}
        >
          {title}
        </h3>
      )}
      <div
        {...mergeStyleProps(
          undefined,
          "lenso-ui-inspector__section-body",
          styles.inspectorSectionBody
        )}
      >
        {children}
      </div>
    </section>
  );
}

function InspectorActions({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & { stylex?: ConsoleStyle }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-inspector__actions", className),
        styles.inspectorActions
      )}
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
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"section"> & { stylex?: ConsoleStyle }
>) {
  return (
    <section
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-section", className),
        styles.section
      )}
      {...props}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"header"> & { stylex?: ConsoleStyle }
>) {
  return (
    <header
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-section__header", className),
        styles.sectionHeader
      )}
      {...props}
    >
      {children}
    </header>
  );
}

function SectionTitle({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"h2"> & { stylex?: ConsoleStyle }
>) {
  return (
    <h2
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-section__title", className),
        styles.sectionTitle
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

function SectionMeta({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"span"> & { stylex?: ConsoleStyle }
>) {
  return (
    <span
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-section__meta", className),
        styles.sectionMeta
      )}
      {...props}
    >
      {children}
    </span>
  );
}

function SectionBody({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & { stylex?: ConsoleStyle }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-section__body", className),
        styles.sectionBody
      )}
      {...props}
    >
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
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"dl"> & { stylex?: ConsoleStyle }
>) {
  return (
    <dl
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-key-values", className)
      )}
      {...props}
    >
      {children}
    </dl>
  );
}

function KeyValueListRow({
  className,
  label,
  value,
  stylex: stylexStyle,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  label: ReactNode;
  value: ReactNode;
  stylex?: ConsoleStyle;
}) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-key-values__row", className),
        styles.keyValuesRow
      )}
      {...props}
    >
      <dt
        {...mergeStyleProps(
          undefined,
          "lenso-ui-key-values__label",
          styles.keyValuesLabel
        )}
      >
        {label}
      </dt>
      <dd
        {...mergeStyleProps(
          undefined,
          "lenso-ui-key-values__value",
          styles.keyValuesValue
        )}
      >
        {value}
      </dd>
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
  stylex: stylexStyle,
  title,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  action?: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  stylex?: ConsoleStyle;
}) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-state", className),
        styles.state
      )}
      {...props}
    >
      {icon ? (
        <span
          {...mergeStyleProps(
            undefined,
            "lenso-ui-state__icon",
            styles.stateIcon
          )}
        >
          {icon}
        </span>
      ) : null}
      <strong
        {...mergeStyleProps(
          undefined,
          "lenso-ui-state__title",
          styles.stateTitle
        )}
      >
        {title}
      </strong>
      <p
        {...mergeStyleProps(
          undefined,
          "lenso-ui-state__description",
          styles.stateDescription
        )}
      >
        {description}
      </p>
      {action ? (
        <div
          {...mergeStyleProps(
            undefined,
            "lenso-ui-state__action",
            styles.stateAction
          )}
        >
          {action}
        </div>
      ) : null}
    </div>
  );
}

type TabsDensity = "default" | "page" | "inspector";

const TabsContext = createContext<{
  density: TabsDensity;
  leadingIcon: boolean;
}>({ density: "default", leadingIcon: false });

function TabsRoot({
  children,
  className,
  density = "default",
  inset = "default",
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    density?: "default" | "page" | "inspector";
    inset?: "default" | "none" | "sm";
    stylex?: ConsoleStyle;
  }
>) {
  const context = { density, leadingIcon: false } as const;
  return (
    <TabsContext.Provider value={context}>
      <div
        {...mergeStyleProps(stylexStyle, classes("lenso-ui-tabs", className))}
        data-density={density}
        data-inset={inset}
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({
  children,
  className,
  inset,
  leadingIcon,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    inset?: "default" | "none" | "sm";
    leadingIcon?: boolean;
    stylex?: ConsoleStyle;
  }
>) {
  const context = useContext(TabsContext);
  return (
    <TabsContext.Provider
      value={{ ...context, leadingIcon: Boolean(leadingIcon) }}
    >
      <div
        {...mergeStyleProps(
          stylexStyle,
          classes("lenso-ui-tabs__list", className),
          styles.tabsList,
          context.density === "page" ? styles.tabsListPage : null,
          context.density === "inspector" ? styles.tabsListInspector : null,
          inset === "sm" ? styles.tabsListInsetSm : null
        )}
        data-inset={inset}
        data-leading={leadingIcon ? "icon" : undefined}
        role="tablist"
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsTab({
  children,
  className,
  onKeyDown,
  selected,
  stylex: stylexStyle,
  type = "button",
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    selected: boolean;
    stylex?: ConsoleStyle;
  }
>) {
  const { density, leadingIcon } = useContext(TabsContext);
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
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-tabs__tab", className),
        styles.tabsTab,
        density !== "default" ? styles.tabsTabDense : null,
        selected ? styles.tabsTabSelected : null,
        selected && density !== "default" ? styles.tabsTabSelectedDense : null,
        selected && leadingIcon ? styles.tabsTabSelectedLeadingIcon : null
      )}
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
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & { stylex?: ConsoleStyle }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-tabs__panel", className),
        styles.tabsPanel
      )}
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
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"section"> & { stylex?: ConsoleStyle }
>) {
  return (
    <section
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-settings-group", className),
        styles.settingsGroup
      )}
      {...props}
    >
      {children}
    </section>
  );
}

function SettingsGroupHeader({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"header"> & { stylex?: ConsoleStyle }
>) {
  return (
    <header
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-settings-group__header", className),
        styles.settingsGroupHeader
      )}
      {...props}
    >
      {children}
    </header>
  );
}

function SettingsGroupTitle({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"h2"> & { stylex?: ConsoleStyle }
>) {
  return (
    <h2
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-settings-group__title", className),
        styles.settingsGroupTitle
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

function SettingsGroupDescription({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"p"> & { stylex?: ConsoleStyle }
>) {
  return (
    <p
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-settings-group__description", className),
        styles.settingsGroupDescription
      )}
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
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & {
    description?: ReactNode;
    label: ReactNode;
    stylex?: ConsoleStyle;
  }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-settings-row", className),
        styles.settingsRow
      )}
      {...props}
    >
      <div
        {...mergeStyleProps(
          undefined,
          "lenso-ui-settings-row__copy",
          styles.settingsRowCopy
        )}
      >
        <div
          {...mergeStyleProps(
            undefined,
            "lenso-ui-settings-row__label",
            styles.settingsRowLabel
          )}
        >
          {label}
        </div>
        {description ? (
          <div
            {...mergeStyleProps(
              undefined,
              "lenso-ui-settings-row__description",
              styles.settingsRowDescription
            )}
          >
            {description}
          </div>
        ) : null}
      </div>
      <div
        {...mergeStyleProps(
          undefined,
          "lenso-ui-settings-row__control",
          styles.settingsRowControl
        )}
      >
        {children}
      </div>
    </div>
  );
}

function FieldRoot({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & { stylex?: ConsoleStyle }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-field", className),
        styles.field
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function FieldLabel({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"label"> & { stylex?: ConsoleStyle }
>) {
  return (
    <label
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-field__label", className),
        styles.fieldLabel
      )}
      {...props}
    >
      {children}
    </label>
  );
}

function FieldHint({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"p"> & { stylex?: ConsoleStyle }
>) {
  return (
    <p
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-field__hint", className),
        styles.fieldHint
      )}
      {...props}
    >
      {children}
    </p>
  );
}

function FieldError({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"p"> & { stylex?: ConsoleStyle }
>) {
  return (
    <p
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-field__error", className),
        styles.fieldError
      )}
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
  stylex: stylexStyle,
  ...props
}: ComponentPropsWithoutRef<"input"> & { stylex?: ConsoleStyle }) {
  return (
    <input
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-input", className),
        styles.input
      )}
      {...props}
    />
  );
}

export function Select({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  SelectHTMLAttributes<HTMLSelectElement> & { stylex?: ConsoleStyle }
>) {
  return (
    <select
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-select", className),
        styles.input
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className,
  stylex: stylexStyle,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { stylex?: ConsoleStyle }) {
  return (
    <textarea
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-textarea", className),
        styles.input,
        styles.textarea
      )}
      {...props}
    />
  );
}

function EmptyStateRoot({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"div"> & { stylex?: ConsoleStyle }
>) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-empty-state", className),
        styles.emptyState
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function EmptyStateIcon({
  children,
  stylex: stylexStyle,
}: {
  children: ReactNode;
  stylex?: ConsoleStyle;
}) {
  return (
    <div
      {...mergeStyleProps(
        stylexStyle,
        "lenso-ui-empty-state__icon",
        styles.emptyStateIcon
      )}
    >
      {children}
    </div>
  );
}

function EmptyStateTitle({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"h2"> & { stylex?: ConsoleStyle }
>) {
  return (
    <h2
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-empty-state__title", className),
        styles.emptyStateTitle
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

function EmptyStateDescription({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"p"> & { stylex?: ConsoleStyle }
>) {
  return (
    <p
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-empty-state__description", className),
        styles.emptyStateDescription
      )}
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
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"table"> & { stylex?: ConsoleStyle }
>) {
  return (
    <div
      {...mergeStyleProps(undefined, "lenso-ui-table-wrap", styles.tableWrap)}
    >
      <table
        {...mergeStyleProps(
          stylexStyle,
          classes("lenso-ui-table", className),
          styles.table
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

function DataTableHead({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"thead"> & { stylex?: ConsoleStyle }
>) {
  return (
    <thead
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-table__head", className),
        styles.tableHead
      )}
      {...props}
    >
      {children}
    </thead>
  );
}

function DataTableBody({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"tbody"> & { stylex?: ConsoleStyle }
>) {
  return (
    <tbody
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-table__body", className)
      )}
      {...props}
    >
      {children}
    </tbody>
  );
}

function DataTableRow({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"tr"> & { stylex?: ConsoleStyle }
>) {
  return (
    <tr
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-table__row", className),
        styles.tableRow
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

function DataTableHeader({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"th"> & { stylex?: ConsoleStyle }
>) {
  return (
    <th
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-table__header", className),
        styles.dataTableHeaderCell
      )}
      {...props}
    >
      {children}
    </th>
  );
}

function DataTableCell({
  children,
  className,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  ComponentPropsWithoutRef<"td"> & { stylex?: ConsoleStyle }
>) {
  return (
    <td
      {...mergeStyleProps(
        stylexStyle,
        classes("lenso-ui-table__cell", className),
        styles.dataTableCell
      )}
      {...props}
    >
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
  FilterSelect: typeof FilterSelect;
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
  SurfaceRoot: typeof SurfaceRoot;
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
  FilterSelect,
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
  SurfaceRoot,
};
