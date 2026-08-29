/* eslint-disable sort-keys */

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
    passWithNoTests: true,
  },
});
