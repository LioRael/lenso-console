import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ConsoleStyle } from "@lenso/console-ui";
import * as stylex from "@stylexjs/stylex";
import type { HTMLAttributes, PropsWithChildren } from "react";

const localStyles = stylex.create({
  utilityFixed: {
    position: "fixed",
  },
  utilityInset0: {
    inset: "calc(0.25rem * 0)",
  },
  utilityZ30: {
    zIndex: "30",
  },
  utilityBgBgScrim: {
    backgroundColor: "var(--bg-scrim)",
  },
  utilityRight2: {
    right: "calc(0.25rem * 2)",
  },
  utilityTop2: {
    top: "calc(0.25rem * 2)",
  },
  utilityZ40: {
    zIndex: "40",
  },
  utilityHCalc100vh16px: {
    height: "calc(100vh - 16px)",
  },
  utilityWMin540pxCalc100vw16px: {
    width: "min(540px, calc(100vw - 16px))",
  },
  utilityOverflowAuto: {
    overflow: "auto",
  },
  utilityRoundedVarRadiusOverlay: {
    borderRadius: "var(--radius-overlay)",
  },
  utilityBorder: {
    borderStyle: "solid",
    borderWidth: "1px",
  },
  utilityBorderLine: {
    borderColor: "var(--line)",
  },
  utilityBgBgOverlay: {
    backgroundColor: "var(--bg-overlay)",
  },
  utilityShadowElevationOverlay: {
    boxShadow: "var(--elevation-overlay)",
  },
  utilityTransition: {
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  },
  utilityDuration200: {
    transitionDuration: "200ms",
  },
  utilityDataStartingStyleTranslateX2: {
    "[data-starting-style]": {
      translate: "0.5rem 0",
    },
  },
  utilityDataStartingStyleOpacity0: {
    "[data-starting-style]": {
      opacity: "0%",
    },
  },
});

function DrawerRoot({
  children,
  onOpenChange,
  open,
}: PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  return (
    <BaseDialog.Root onOpenChange={onOpenChange} open={open}>
      {children}
    </BaseDialog.Root>
  );
}

function DrawerContent({
  children,
  stylex: stylexStyle,
  ...props
}: PropsWithChildren<
  Omit<HTMLAttributes<HTMLDivElement>, "className" | "style"> & {
    stylex?: ConsoleStyle;
  }
>) {
  const popupStyle = [
    localStyles.utilityFixed,
    localStyles.utilityRight2,
    localStyles.utilityTop2,
    localStyles.utilityZ40,
    localStyles.utilityHCalc100vh16px,
    localStyles.utilityWMin540pxCalc100vw16px,
    localStyles.utilityOverflowAuto,
    localStyles.utilityRoundedVarRadiusOverlay,
    localStyles.utilityBorder,
    localStyles.utilityBorderLine,
    localStyles.utilityBgBgOverlay,
    localStyles.utilityShadowElevationOverlay,
    localStyles.utilityTransition,
    localStyles.utilityDuration200,
    localStyles.utilityDataStartingStyleTranslateX2,
    localStyles.utilityDataStartingStyleOpacity0,
  ];
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        {...stylex.props([
          localStyles.utilityFixed,
          localStyles.utilityInset0,
          localStyles.utilityZ30,
          localStyles.utilityBgBgScrim,
        ])}
      />
      <BaseDialog.Popup {...stylex.props(popupStyle, stylexStyle)} {...props}>
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export const Drawer = Object.assign(DrawerRoot, {
  Content: DrawerContent,
  Title: BaseDialog.Title,
  Close: BaseDialog.Close,
});
