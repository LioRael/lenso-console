import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vitest/config";

import { consoleStylex } from "./config/console-stylex.ts";

const isVitest = process.env.VITEST === "true";
const startPlugin = isVitest
  ? []
  : [
      tanstackStart({
        spa: {
          enabled: true,
          prerender: {
            crawlLinks: false,
            outputPath: "/index.html",
            // The preview server is started asynchronously by TanStack Start.
            // CI runners can need a few hundred milliseconds before its port is
            // accepting connections; retry the shell request without hiding
            // genuine render failures.
            retryCount: 5,
            retryDelay: 250,
          },
        },
      }),
    ];
const deploymentPlugin = isVitest ? [] : [nitro()];

export default defineConfig({
  base: "/",
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react")) {
            return "react";
          }
          if (id.includes("node_modules/gsap")) {
            return "gsap";
          }
          if (
            id.includes("node_modules/@base-ui") ||
            id.includes("node_modules/lucide-react")
          ) {
            return "ui-vendor";
          }
        },
      },
    },
  },
  plugins: [...startPlugin, ...deploymentPlugin, react(), consoleStylex()],
  preview: {
    // TanStack Start prerenders through a build-time Vite preview server.
    // Bind it explicitly so CI/Docker resolve the same loopback address.
    host: "127.0.0.1",
  },
  server: {
    port: 5174,
  },
});
