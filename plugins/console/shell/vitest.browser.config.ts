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
      "@lenso/ui",
      "@lenso/ui/button-group",
      "@lenso/ui/checkbox",
      "@lenso/ui/autocomplete",
      "@lenso/ui/breadcrumbs",
      "@lenso/ui/button",
      "@lenso/ui/chip",
      "@lenso/ui/input",
      "@lenso/ui/modal",
      "@lenso/ui/popover",
      "@lenso/ui/slider",
      "@lenso/ui/textarea",
      "@lenso/ui/textfield",
      "@lenso/ui/menu",
      "@lenso/ui/select",
      "@lenso/ui/surface",
      "@lenso/ui/switch",
      "@lenso/ui/tabs",
      "@lenso/ui/tooltip",
      "@stylexjs/stylex",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "ky",
      "use-sync-external-store/shim",
      "use-sync-external-store/shim/with-selector",
      "zod",
    ],
  },
  plugins: [react(), consoleStylex()],
  test: {
    // StyleX development styles are shared by the Vite server. Keep browser
    // files serial so concurrent transforms cannot invalidate another page.
    fileParallelism: false,
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
