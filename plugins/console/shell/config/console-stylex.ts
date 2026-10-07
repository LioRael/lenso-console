import type { UserOptions } from "@stylexjs/unplugin";
import stylex from "@stylexjs/unplugin/vite";

export type ConsoleStylexOptions = Partial<UserOptions>;

export const consoleStylex = (options: ConsoleStylexOptions = {}) =>
  stylex({
    // The full mode only adds the CSS refresh helper in Vite development;
    // production output remains statically extracted and has no StyleX runtime
    // requirement.
    dev: false,
    devMode: "full",
    // Product overrides must outrank the package's base reset even when a
    // browser fixture loads extracted styles before the package stylesheet.
    useCSSLayers: false,
    ...options,
  });
