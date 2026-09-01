/* eslint-disable prefer-arrow-callback, react/no-react-children, react/no-clone-element -- Registry-owned copy mirrors the canonical recipe. */

import { Surface, type SurfaceProps } from "@lenso/ui/surface";
import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import { settingsSectionStyles as styles } from "./settings-section.stylex";

type Xstyle = stylex.StyleXStyles;

export type SettingsSectionRootProps =
  React.ComponentPropsWithoutRef<"section"> & {
    xstyle?: Xstyle;
  };

export const SettingsSectionRoot = React.forwardRef<
  HTMLElement,
  SettingsSectionRootProps
>(function SettingsSectionRoot({ className, xstyle, ...props }, ref) {
  return (
    <section
      {...props}
      className={[stylex.props(styles.root, xstyle).className, className]
        .filter(Boolean)
        .join(" ")}
      data-slot="settings-section"
      ref={ref}
    />
  );
});

export type SettingsSectionHeaderProps =
  React.ComponentPropsWithoutRef<"header"> & {
    xstyle?: Xstyle;
  };

export const SettingsSectionHeader = React.forwardRef<
  HTMLElement,
  SettingsSectionHeaderProps
>(function SettingsSectionHeader({ className, xstyle, ...props }, ref) {
  return (
    <header
      {...props}
      className={[stylex.props(styles.header, xstyle).className, className]
        .filter(Boolean)
        .join(" ")}
      data-slot="settings-section-header"
      ref={ref}
    />
  );
});

export type SettingsSectionTitleProps = React.ComponentPropsWithoutRef<"h2"> & {
  xstyle?: Xstyle;
};

export const SettingsSectionTitle = React.forwardRef<
  HTMLHeadingElement,
  SettingsSectionTitleProps
>(function SettingsSectionTitle(
  { children, className, xstyle, ...props },
  ref
) {
  return (
    <h2
      {...props}
      className={[stylex.props(styles.title, xstyle).className, className]
        .filter(Boolean)
        .join(" ")}
      data-slot="settings-section-title"
      ref={ref}
    >
      {children}
    </h2>
  );
});

export type SettingsSectionDescriptionProps =
  React.ComponentPropsWithoutRef<"p"> & { xstyle?: Xstyle };

export const SettingsSectionDescription = React.forwardRef<
  HTMLParagraphElement,
  SettingsSectionDescriptionProps
>(function SettingsSectionDescription({ className, xstyle, ...props }, ref) {
  return (
    <p
      {...props}
      className={[stylex.props(styles.description, xstyle).className, className]
        .filter(Boolean)
        .join(" ")}
      data-slot="settings-section-description"
      ref={ref}
    />
  );
});

export type SettingsGroupProps = Omit<SurfaceProps, "level" | "xstyle"> & {
  xstyle?: Xstyle;
};

/**
 * The visual rows container used inside a SettingsSection. It is also exposed
 * as SettingsSection.Group so both spellings share this one implementation.
 */
export const SettingsGroup = React.forwardRef<HTMLElement, SettingsGroupProps>(
  function SettingsGroup({ children, xstyle, ...props }, ref) {
    const rows = React.Children.toArray(children);
    return (
      <Surface
        {...props}
        data-recipe="settings-group"
        level="panel"
        ref={ref}
        xstyle={[styles.group, xstyle]}
      >
        {rows.map((row, index) =>
          React.isValidElement<{ xstyle?: stylex.StyleXStyles }>(row) &&
          index === rows.length - 1
            ? React.cloneElement(row, {
                xstyle: [row.props.xstyle, styles.lastRow],
              })
            : row
        )}
      </Surface>
    );
  }
);

export const SettingsSection = {
  Description: SettingsSectionDescription,
  Group: SettingsGroup,
  Header: SettingsSectionHeader,
  Root: SettingsSectionRoot,
  Title: SettingsSectionTitle,
} as const;
