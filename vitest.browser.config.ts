/* eslint-disable sort-keys */

import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import { consoleStylex } from "./config/console-stylex";

export default defineConfig({
  resolve: {
    alias: {
      "@lenso/console-module-api": resolve(
        import.meta.dirname,
        "packages/console-module-api/src/index.ts"
      ),
      "@lenso/console-ui": resolve(
        import.meta.dirname,
        "packages/console-ui/src/index.tsx"
      ),
      "@lenso/console-tokens/tokens.stylex": resolve(
        import.meta.dirname,
        "packages/console-tokens/src/tokens.stylex.ts"
      ),
      "@lenso/console-tokens": resolve(
        import.meta.dirname,
        "packages/console-tokens/src/index.ts"
      ),
      "@lenso/console-composition-api": resolve(
        import.meta.dirname,
        "packages/console-composition-api/src/index.ts"
      ),
    },
  },
  plugins: [react(), consoleStylex()],
  test: {
    browser: {
      enabled: true,
      instances: [{ browser: "chromium" }],
      provider: playwright({
        launchOptions: {
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        },
      }),
    },
    include: ["src/**/*.browser.test.tsx"],
  },
});
