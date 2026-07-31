/* eslint-disable func-style */

import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
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

export function StatusMarker({
  align = "center",
  children,
  className,
  tone = "neutral",
  ...props
}: StatusMarkerProps) {
  return (
    <span
      className={classes("lenso-ui-status", className)}
      data-align={align}
      data-tone={tone}
      {...props}
    >
      <span aria-hidden="true" className="lenso-ui-status__dot" />
      <span>{children}</span>
    </span>
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

function TabsRoot({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"div">>) {
  return (
    <div className={classes("lenso-ui-tabs", className)} {...props}>
      {children}
    </div>
  );
}

function TabsList({
  children,
  className,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<"div">>) {
  return (
    <div
      className={classes("lenso-ui-tabs__list", className)}
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
  selected,
  type = "button",
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }
>) {
  return (
    <button
      aria-selected={selected}
      className={classes("lenso-ui-tabs__tab", className)}
      role="tab"
      type={type}
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
  DataTable: typeof DataTable;
  EmptyState: typeof EmptyState;
  Field: typeof Field;
  IconButton: typeof IconButton;
  Input: typeof Input;
  Panel: typeof Panel;
  Select: typeof Select;
  SettingsGroup: typeof SettingsGroup;
  SettingsRow: typeof SettingsRow;
  StatusMarker: typeof StatusMarker;
  Tabs: typeof Tabs;
  Textarea: typeof Textarea;
}

export const consoleUi: ConsoleUiComponents = {
  Badge,
  Button,
  ConsolePage,
  DataTable,
  EmptyState,
  Field,
  IconButton,
  Input,
  Panel,
  Select,
  SettingsGroup,
  SettingsRow,
  StatusMarker,
  Tabs,
  Textarea,
};
