import { resolve } from "node:path";

import type { UserOptions } from "@stylexjs/unplugin";
import stylex from "@stylexjs/unplugin/vite";

export const consoleStylexAliases = {
  "@lenso/console-tokens/tokens.stylex": [
    resolve(
      import.meta.dirname,
      "../packages/console-tokens/src/tokens.stylex.ts"
    ),
  ],
} satisfies NonNullable<UserOptions["aliases"]>;

export type ConsoleStylexOptions = Omit<Partial<UserOptions>, "aliases">;

export const consoleStylex = (options: ConsoleStylexOptions = {}) =>
  stylex({
    aliases: consoleStylexAliases,
    // The full mode only adds the CSS refresh helper in Vite development;
    // production output remains statically extracted and has no StyleX runtime
    // requirement.
    devMode: "full",
    useCSSLayers: true,
    ...options,
  });
