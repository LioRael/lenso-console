/* eslint-disable sort-keys */

import path from "node:path";

import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import { consoleStylex } from "./config/console-stylex.ts";

export default defineConfig({
  optimizeDeps: {
    include: [
      "@gsap/react",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "gsap",
      "ky",
    ],
  },
  resolve: {
    alias: {
      "@lenso/console-module-api": path.resolve(
        import.meta.dirname,
        "packages/console-module-api/src/index.ts"
      ),
      "@lenso/console-ui": path.resolve(
        import.meta.dirname,
        "packages/console-ui/src/index.tsx"
      ),
      "@lenso/console-tokens/tokens.stylex": path.resolve(
        import.meta.dirname,
        "packages/console-tokens/src/tokens.stylex.ts"
      ),
      "@lenso/console-tokens": path.resolve(
        import.meta.dirname,
        "packages/console-tokens/src/index.ts"
      ),
      "@lenso/console-composition-api": path.resolve(
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
