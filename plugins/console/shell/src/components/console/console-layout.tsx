import * as stylex from "@stylexjs/stylex";
import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cornerStyles, layoutStyles } from "./console-layout.styles";
import { ConsoleTopEdge, type TopEdgeOptions } from "./console-top-edge";

const ForegroundTarget = createContext<HTMLDivElement | null | undefined>(
  undefined
);

function useForegroundTarget() {
  const target = useContext(ForegroundTarget);
  if (target === undefined) {
    throw new Error(
      "ConsoleLayout.Corner and ConsoleLayout.Foreground require ConsoleLayout."
    );
  }
  return target;
}

export type ConsoleCornerArea =
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";

export interface ConsoleCornerProps {
  area: ConsoleCornerArea;
  children: ReactNode;
  className?: string;
  xstyle?: stylex.StyleXStyles;
  active?: boolean;
}

function Corner({
  area,
  children,
  className,
  xstyle,
  active = true,
}: ConsoleCornerProps) {
  const target = useForegroundTarget();
  if (!active || !target) {
    return null;
  }
  const styled = stylex.props(layoutStyles.corner, cornerStyles[area], xstyle);
  return createPortal(
    <div
      {...styled}
      className={["console-layout-corner", styled.className, className]
        .filter(Boolean)
        .join(" ")}
      data-console-corner={area}
    >
      {children}
    </div>,
    target
  );
}

export interface ConsoleForegroundProps {
  children: ReactNode;
  className?: string;
  xstyle?: stylex.StyleXStyles;
  active?: boolean;
}

function Foreground({
  children,
  className,
  xstyle,
  active = true,
}: ConsoleForegroundProps) {
  const target = useForegroundTarget();
  if (!active || !target) {
    return null;
  }
  const styled = stylex.props(layoutStyles.floating, xstyle);
  return createPortal(
    <div
      {...styled}
      className={["console-layout-floating", styled.className, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>,
    target
  );
}

export type ConsoleLayoutProps = ComponentProps<"div"> & {
  topEdge?: Partial<TopEdgeOptions>;
  xstyle?: stylex.StyleXStyles;
};

function Layout({
  children,
  className,
  topEdge,
  xstyle,
  style,
  ...props
}: ConsoleLayoutProps) {
  // The state setter is a stable ref callback. Portals keep each page's React providers.
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const styled = stylex.props(layoutStyles.root, xstyle);
  const content = stylex.props(layoutStyles.content);
  const foreground = stylex.props(layoutStyles.foreground);
  return (
    <div
      {...props}
      {...styled}
      style={style || styled.style ? { ...style, ...styled.style } : undefined}
      className={["console-layout", styled.className, className]
        .filter(Boolean)
        .join(" ")}
    >
      <ForegroundTarget.Provider value={target}>
        <div
          {...content}
          className={`console-layout-content ${content.className}`}
        >
          {children}
        </div>
        <ConsoleTopEdge
          {...(topEdge === undefined ? {} : { options: topEdge })}
        />
        <div
          {...foreground}
          className={`console-layout-foreground ${foreground.className}`}
          ref={setTarget}
        />
      </ForegroundTarget.Provider>
    </div>
  );
}

export const ConsoleLayout = Object.assign(Layout, { Corner, Foreground });
