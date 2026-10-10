import type { ConsoleActivation } from "@lenso/console-react";
import type { ComponentType } from "react";

import type { JsonObject } from "./contract";
import { definitionMap, type DashboardConfigDefinition } from "./validation";

export interface DashboardWidgetProps {
  instanceId: string;
  definition: {
    bindingId: string;
    widgetId: string;
    implementationRevision?: string;
  };
  config: JsonObject;
  activation: ConsoleActivation;
  signal: AbortSignal;
}
export interface DashboardConfigEditorProps {
  config: JsonObject;
  onChange(config: JsonObject): void;
}
export interface DashboardWidgetDefinition extends DashboardConfigDefinition {
  title: string;
  /** Runtime implementation identity; independent of saved configuration version. */
  implementationRevision?: string;
  sizes: {
    default: { width: number; height: number };
    min: { width: number; height: number };
    max: { width: number; height: number };
  };
  defaultConfig: JsonObject;
  renderer: ComponentType<DashboardWidgetProps>;
  ConfigEditor?: ComponentType<DashboardConfigEditorProps>;
}

/** Definitions are explicitly bound by the application, not discovered from page mounts. */
export function defineDashboardWidget(
  definition: DashboardWidgetDefinition
): DashboardWidgetDefinition {
  definitionMap([definition]);
  const size = definition.sizes.default;
  if (
    !Number.isSafeInteger(size.width) ||
    !Number.isSafeInteger(size.height) ||
    size.width < definition.sizes.min.width ||
    size.width > definition.sizes.max.width ||
    size.height < definition.sizes.min.height ||
    size.height > definition.sizes.max.height
  ) {
    throw new Error("Invalid default widget size");
  }
  definition.configSchema.parse(definition.defaultConfig);
  return definition;
}
