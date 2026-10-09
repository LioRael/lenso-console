import type { Plugin } from "@lenso/core";

import { createConsoleService } from "./service";
import type { ConsoleOptions, ConsoleService } from "./types";

export function createConsolePlugin(
  options: ConsoleOptions
): Plugin<ConsoleService> {
  return {
    id: options.id ?? "console",
    config: options.config,
    requires: [
      ...new Set([
        options.authentication,
        ...(options.locale ? [options.locale] : []),
        ...options.targets
          .filter((target) => !target.running)
          .flatMap((target) => target.plugins),
      ]),
    ],
    setup(context) {
      if (options.config && !context.config) {
        throw new Error(
          "This Lenso runtime does not support Console configuration bindings"
        );
      }
      const configuration = options.config
        ? context.config!(options.config)
        : {};
      const service = createConsoleService(
        context,
        context.get(options.authentication),
        { ...options, ...configuration }
      );
      context.onCleanup(() => service.close?.());
      return service;
    },
  };
}
