import type {
  ConsoleClient,
  ConsoleCommandFactory,
  ConsoleModuleManifest,
  ConsoleQueryOperation,
  ConsoleSurfaceManifest,
} from "@lenso/console-module-api";
import { validateConsoleManifest } from "@lenso/console-module-api";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ComponentType, ReactNode } from "react";

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const operationFingerprint = (
  operation: ConsoleQueryOperation<unknown>
): string => {
  try {
    return JSON.stringify([operation.kind, operation.name, operation.input]);
  } catch {
    return `${operation.kind}:${operation.name}`;
  }
};

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

const ConsoleClientContext = createContext<ConsoleClient | null>(null);

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

export type ConsoleQueryState<T> =
  | {
      readonly status: "pending";
      readonly data?: undefined;
      readonly error?: undefined;
    }
  | { readonly status: "success"; readonly data: T; readonly error?: undefined }
  | { readonly status: "error"; readonly data?: T; readonly error: Error };

export const useConsoleQuery = <Result,>(
  operation: ConsoleQueryOperation<Result>,
  { enabled = true }: { enabled?: boolean } = {}
): ConsoleQueryState<Result> => {
  const client = useConsoleClient();
  const operationRef = useRef(operation);
  operationRef.current = operation;
  const operationKey = operationFingerprint(operation);
  const [state, setState] = useState<ConsoleQueryState<Result>>({
    status: "pending",
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    setState({ status: "pending" });
    void (async () => {
      try {
        const data = await client.query(operationRef.current);
        if (active) {
          setState({ data, status: "success" });
        }
      } catch (error) {
        if (active) {
          setState({ error: toError(error), status: "error" });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [client, enabled, operationKey]);

  return enabled ? state : { status: "pending" };
};

export interface ConsoleCommandState<Result> {
  readonly status: "idle" | "pending" | "success" | "error";
  readonly data?: Result;
  readonly error?: Error;
  readonly execute: () => Promise<Result>;
}

export const useConsoleCommand = <Input, Result>(
  factory: ConsoleCommandFactory<Input, Result>,
  input: Input
): ConsoleCommandState<Result> => {
  const client = useConsoleClient();
  const [state, setState] = useState<
    Pick<ConsoleCommandState<Result>, "status" | "data" | "error">
  >({ status: "idle" });
  const execute = useCallback(async () => {
    setState({ status: "pending" });
    try {
      const data = await client.command(factory(input));
      setState({ data, status: "success" });
      return data;
    } catch (error) {
      const normalized = toError(error);
      setState({ error: normalized, status: "error" });
      throw normalized;
    }
  }, [client, factory, input]);

  return { ...state, execute };
};

export type {
  ConsoleClient,
  ConsoleCommandFactory,
  ConsoleCommandOperation,
  ConsoleModuleManifest,
  ConsoleQueryOperation,
} from "@lenso/console-module-api";

export {
  ConsoleLocaleProvider,
  useConsoleLocale,
  type ConsoleLanguagePreference,
  type ConsoleLocale,
  type ConsoleLocaleContextValue,
} from "./locale.js";

export {
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
  type FilterControlProps,
  type IconButtonProps,
  type IconSlotProps,
  type IconSlotSize,
  type InlineStatusProps,
  type InspectorProps,
  type PaneHeaderProps,
  type SemanticTone,
  type StatusMarkerProps,
  type SurfaceGroupLabelProps,
  type TableHeaderProps,
} from "./ui.js";
