/* eslint-disable func-style */

import type { ComponentType, ReactNode } from "react";

export * from "./theme-bundle";

export const CONSOLE_UI_COMPOSITION_PROTOCOL =
  "lenso.console-ui-composition.v1" as const;

export type ConsoleUiCompositionSlot =
  | "root"
  | "shell"
  | "navigation"
  | "workspaceSwitcher"
  | "header"
  | "content"
  | "loading"
  | "error";

export interface ConsoleUiNavigationItem {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly group?: string;
  readonly order?: number;
  readonly icon?: string;
}

export interface ConsoleUiNavigationModel {
  readonly items: readonly ConsoleUiNavigationItem[];
}

export interface ConsoleUiCompositionContext {
  readonly bundleId: string;
  readonly variantId: string;
  readonly navigation: ConsoleUiNavigationModel;
  readonly slots: Readonly<Record<ConsoleUiCompositionSlot, ReactNode>>;
}

export type ConsoleUiSlotComponent = ComponentType<{
  readonly children?: ReactNode;
  readonly context: ConsoleUiCompositionContext;
}>;

export interface ConsoleUiComposition {
  readonly protocol: typeof CONSOLE_UI_COMPOSITION_PROTOCOL;
  readonly consoleUi: string;
  readonly slots?: Readonly<
    Partial<Record<ConsoleUiCompositionSlot, ConsoleUiSlotComponent>>
  >;
  readonly arrangeNavigation?: (
    model: ConsoleUiNavigationModel
  ) => ConsoleUiNavigationModel;
}

export function defineConsoleUiComposition(
  composition: ConsoleUiComposition
): ConsoleUiComposition {
  if (
    !composition ||
    composition.protocol !== CONSOLE_UI_COMPOSITION_PROTOCOL ||
    !composition.consoleUi.trim()
  ) {
    throw new TypeError("Console UI Composition contract is invalid");
  }
  if (composition.slots) {
    for (const component of Object.values(composition.slots)) {
      if (component !== undefined && typeof component !== "function") {
        throw new TypeError("Console UI Composition slot must be a component");
      }
    }
  }
  if (
    composition.arrangeNavigation !== undefined &&
    typeof composition.arrangeNavigation !== "function"
  ) {
    throw new TypeError(
      "Console UI Composition navigation arrangement must be a function"
    );
  }
  return composition;
}
