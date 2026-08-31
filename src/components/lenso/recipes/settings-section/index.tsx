/* eslint-disable prefer-arrow-callback -- Registry-owned copy mirrors the canonical recipe. */

import { Surface, type SurfaceProps } from "@lenso/ui/surface";
import * as React from "react";

import styles from "./settings-section.module.css";

function mergeClassName(generated?: string, className?: string): string {
  return [generated, className].filter(Boolean).join(" ");
}

export type SettingsSectionRootProps =
  React.ComponentPropsWithoutRef<"section">;

export const SettingsSectionRoot = React.forwardRef<
  HTMLElement,
  SettingsSectionRootProps
>(function SettingsSectionRoot({ className, ...props }, ref) {
  return (
    <section
      {...props}
      className={mergeClassName(styles.root, className)}
      data-slot="settings-section"
      ref={ref}
    />
  );
});

export type SettingsSectionHeaderProps =
  React.ComponentPropsWithoutRef<"header">;

export const SettingsSectionHeader = React.forwardRef<
  HTMLElement,
  SettingsSectionHeaderProps
>(function SettingsSectionHeader({ className, ...props }, ref) {
  return (
    <header
      {...props}
      className={mergeClassName(styles.header, className)}
      data-slot="settings-section-header"
      ref={ref}
    />
  );
});

export type SettingsSectionTitleProps = React.ComponentPropsWithoutRef<"h2">;

export const SettingsSectionTitle = React.forwardRef<
  HTMLHeadingElement,
  SettingsSectionTitleProps
>(function SettingsSectionTitle({ children, className, ...props }, ref) {
  return (
    <h2
      {...props}
      className={mergeClassName(styles.title, className)}
      data-slot="settings-section-title"
      ref={ref}
    >
      {children}
    </h2>
  );
});

export type SettingsSectionDescriptionProps =
  React.ComponentPropsWithoutRef<"p">;

export const SettingsSectionDescription = React.forwardRef<
  HTMLParagraphElement,
  SettingsSectionDescriptionProps
>(function SettingsSectionDescription({ className, ...props }, ref) {
  return (
    <p
      {...props}
      className={mergeClassName(styles.description, className)}
      data-slot="settings-section-description"
      ref={ref}
    />
  );
});

export type SettingsGroupProps = Omit<SurfaceProps, "level">;

/**
 * The visual rows container used inside a SettingsSection. It is also exposed
 * as SettingsSection.Group so both spellings share this one implementation.
 */
export const SettingsGroup = React.forwardRef<HTMLElement, SettingsGroupProps>(
  function SettingsGroup({ className, ...props }, ref) {
    return (
      <Surface
        {...props}
        className={mergeClassName(styles.group, className)}
        data-recipe="settings-group"
        level="panel"
        ref={ref}
      />
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
