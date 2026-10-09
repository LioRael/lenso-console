export {
  ConsoleLayout,
  type ConsoleLayoutProps,
  type ConsoleCornerArea,
  type ConsoleCornerProps,
  type ConsoleForegroundProps,
} from "./console-layout";
export {
  TOP_EDGE_DEFAULTS,
  TOP_EDGE_LIMITS,
  normalizeTopEdgeOptions,
  type TopEdgeOptions,
} from "./console-top-edge";
export {
  createConsolePageContext,
  type ConsolePageContextHandle,
  type ConsolePageContextProviderProps,
} from "./console-page-context";
export {
  ConsoleDock,
  type ConsoleDockProps,
  type ConsoleDockSelection,
  type Position,
} from "./console-dock";
export { ConsoleIconButton } from "./console-icon-button";
export {
  advanceScrollIntent,
  advanceUserScrollIntent,
  emptyScrollIntent,
  type ScrollIntent,
} from "./console-dock-scroll-intent";
