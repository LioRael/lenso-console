import type {
  ConsoleLocalizedLabels,
  ConsoleNavigationMetadata,
  ConsoleSurfaceArea,
} from "@lenso/console-ui";

export type ConsoleModuleMetadata = {
  module_name?: string;
  status?: "loaded" | "error";
  error?: string | null;
  console?: ConsoleSurfaceMetadata[];
  console_slots?: ConsoleSlotMetadata[];
  console_contributions?: ConsoleContributionMetadata[];
};

export type ConsoleSurfaceMetadata = {
  name?: string;
  label?: string;
  localizedLabels?: ConsoleLocalizedLabels;
  area?: ConsoleSurfaceArea;
  route?: string;
  presentation?:
    | { kind?: "declarative"; schema?: unknown }
    | {
        kind?: "esm";
        entry?: string;
        artifact_digest?: string;
      };
  required_capabilities?: readonly string[];
  icon?: string | null;
  navigation?: ConsoleNavigationMetadata;
};

export type ConsoleSlotMetadata = {
  id?: string;
  version?: number;
  label?: string;
  accepts?: readonly ConsoleContributionKindMetadata[];
  context?: readonly ConsoleSlotContextMetadata[];
};

export type ConsoleContributionKindMetadata = "admin_action";

export type ConsoleSlotContextMetadata = {
  name?: string;
  fields?: readonly ConsoleSlotContextFieldMetadata[];
};

export type ConsoleSlotContextFieldMetadata = {
  name?: string;
  field_type?: "string" | "boolean" | "number" | "timestamp";
  required?: boolean;
};

export type ConsoleContributionMetadata = {
  target?: string;
  target_version?: number;
  label?: string;
  action?: ConsoleContributionActionMetadata;
  icon?: string | null;
  required_capabilities?: readonly string[];
};

export type ConsoleContributionActionMetadata = {
  kind?: "admin_action";
  module?: string;
  name?: string;
  input_bindings?: ConsoleActionInputBindingMetadata[];
};

export type ConsoleActionInputBindingMetadata = {
  input?: string;
  value?: ConsoleActionInputValueMetadata;
};

export type ConsoleActionInputValueMetadata = {
  kind?: "slot_context";
  path?: string;
};
