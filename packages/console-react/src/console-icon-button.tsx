import { ThemeScope, Tooltip } from "@lenso/ui";
import { Button, type ButtonRootProps } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { useRef, useState } from "react";

import { iconButtonStyles as styles } from "./console-icon-button.styles";

export function ConsoleIconButton({
  label,
  tooltip = label,
  side = "top",
  children,
  xstyle,
  glyphXstyle,
  ...props
}: Omit<ButtonRootProps, "aria-label" | "isIconOnly"> & {
  label: string;
  tooltip?: string;
  side?: "top" | "bottom" | "left" | "right";
  glyphXstyle?: stylex.StyleXStyles;
}) {
  const pressedLabel = useRef<string | null>(null);
  const [portalMounted, setPortalMounted] = useState(false);
  const glyph = stylex.props(styles.iconGlyph, glyphXstyle);
  return (
    <Tooltip.Root
      onOpenChange={(open) => {
        if (open) {
          setPortalMounted(true);
        }
      }}
      onOpenChangeComplete={(open) => {
        if (!open) {
          setPortalMounted(false);
        }
      }}
    >
      <Tooltip.Trigger
        render={
          <Button
            size="sm"
            {...props}
            xstyle={[styles.focus, styles.iconButton, xstyle]}
            isIconOnly
            data-dashboard-icon="true"
            aria-label={label}
            focusableWhenDisabled
            onPointerDownCapture={(event) => {
              pressedLabel.current = label;
              props.onPointerDownCapture?.(event);
            }}
            onClick={(event) => {
              if (event.detail > 0 && pressedLabel.current !== label) {
                event.preventDefault();
                return;
              }
              pressedLabel.current = null;
              props.onClick?.(event);
            }}
          />
        }
      >
        <span
          {...glyph}
          key={label}
          className={`dashboard-icon-glyph ${glyph.className}`}
        >
          {children}
        </span>
      </Tooltip.Trigger>
      {/* Avoid token-copy observers while closed, but preserve popup exit animations. */}
      {portalMounted && (
        <ThemeScope xstyle={styles.portalScope}>
          <Tooltip.Portal>
            <Tooltip.Positioner side={side} sideOffset={10}>
              <Tooltip.Popup
                xstyle={styles.tooltip}
                data-dashboard-tooltip="true"
              >
                {tooltip}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </ThemeScope>
      )}
    </Tooltip.Root>
  );
}
