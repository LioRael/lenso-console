import type {
  ConsoleClient,
  ConsoleModuleManifest,
  ConsoleSurfaceManifest,
} from "@lenso/console-module-api";
import { validateConsoleManifest } from "@lenso/console-module-api";
import { createContext, useContext } from "react";
import type { ComponentType, Context, ReactNode } from "react";

export interface ConsoleUiSurface extends ConsoleSurfaceManifest {
  component: ComponentType;
}

export interface ConsoleUiModule {
  readonly manifest: ConsoleModuleManifest;
  readonly surfaces: readonly ConsoleUiSurface[];
}

export const defineConsoleUiModule = ({
  manifest,
  surfaces,
}: {
  manifest: ConsoleModuleManifest;
  surfaces: Readonly<Record<string, ComponentType>>;
}): ConsoleUiModule => {
  validateConsoleManifest(manifest);
  const resolved = manifest.surfaces.map((surface) => {
    const component = surfaces[surface.id];
    if (!component) {
      throw new TypeError(
        `Console surface component is missing: ${surface.id}`
      );
    }
    return { ...surface, component };
  });

  return { manifest, surfaces: resolved };
};

const CONSOLE_CLIENT_CONTEXT_KEY = Symbol.for(
  "@lenso/console-ui.ConsoleClientContext.v1"
);
const consoleClientContextGlobal = globalThis as typeof globalThis &
  Record<symbol, Context<ConsoleClient | null> | undefined>;

// A Console Module artifact can bundle its own copy of console-ui. Share only
// the versioned Context identity across those copies; React keeps every client
// value scoped to its Provider tree, including concurrent SSR trees.
const ConsoleClientContext = (consoleClientContextGlobal[
  CONSOLE_CLIENT_CONTEXT_KEY
] ??= createContext<ConsoleClient | null>(null));

export const ConsoleModuleProvider = ({
  children,
  client,
}: {
  children: ReactNode;
  client: ConsoleClient;
}) => (
  <ConsoleClientContext.Provider value={client}>
    {children}
  </ConsoleClientContext.Provider>
);

export const useConsoleClient = (): ConsoleClient => {
  const client = useContext(ConsoleClientContext);
  if (!client) {
    throw new Error(
      "useConsoleClient must be used inside ConsoleModuleProvider"
    );
  }
  return client;
};

export type {
  ConsoleClient,
  ConsoleModuleManifest,
} from "@lenso/console-module-api";

export {
  ConsoleLocaleProvider,
  useConsoleLocale,
  type ConsoleLanguagePreference,
  type ConsoleLocale,
  type ConsoleLocaleContextValue,
} from "./locale";

export {
  Badge,
  Button,
  ConsolePage,
  DataRow,
  DataGrid,
  DataTable,
  EmptyState,
  Field,
  FilterControl,
  FilterSelect,
  IconButton,
  IconSlot,
  Input,
  InlineStatus,
  Inspector,
  KeyValueList,
  Panel,
  PaneHeader,
  Section,
  Select,
  SettingsGroup,
  SettingsRow,
  SurfaceGroupLabel,
  StatusMarker,
  StateView,
  SurfaceRoot,
  SummaryStrip,
  SplitView,
  TableHeader,
  Tabs,
  Textarea,
  consoleUi,
  type BadgeProps,
  type ButtonProps,
  type ButtonVariant,
  type ConsoleTableVariant,
  type ConsoleUiComponents,
  type ControlSize,
  type DataRowProps,
  type DataGridProps,
  type FilterControlProps,
  type FilterSelectProps,
  type IconButtonProps,
  type IconSlotProps,
  type IconSlotSize,
  type InlineStatusProps,
  type InspectorProps,
  type PaneHeaderProps,
  type SemanticTone,
  type StatusMarkerProps,
  type ConsoleSurfaceRootProps,
  type SurfaceGroupLabelProps,
  type TableHeaderProps,
  type ConsoleStyle,
} from "./ui";

export * from "./host";

export {
  controlStyles,
  dataStyles,
  formStyles,
  layoutStyles,
  pageStyles,
  settingsStyles,
  tableStyles,
} from "./ui";
