/* eslint-disable sort-keys */

import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import { consoleStylex } from "./config/console-stylex.ts";

const browserExecutablePath =
  process.env.LENSO_BROWSER_EXECUTABLE_PATH?.trim() || undefined;

export default defineConfig({
  optimizeDeps: {
    include: [
      "@gsap/react",
      "@lenso/ui/button",
      "@lenso/ui/dialog",
      "@lenso/ui/icon-button",
      "@lenso/ui/surface",
      "@lenso/ui/theme-scope",
      "@streamdown/cjk",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "gsap",
      "ky",
      "streamdown",
    ],
  },
  plugins: [react(), consoleStylex()],
  test: {
    browser: {
      enabled: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(
        browserExecutablePath
          ? { launchOptions: { executablePath: browserExecutablePath } }
          : {}
      ),
      viewport: { height: 800, width: 1280 },
    },
    include: ["src/**/*.browser.test.tsx"],
  },
});
