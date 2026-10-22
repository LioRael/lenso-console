import type { IncomingMessage, ServerResponse } from "node:http";

import { defineConfig } from "vite";

import { operationsFixture } from "../../../packages/console/test/operations-fixture.ts";
import { consoleStylex } from "../../../plugins/console/shell/config/console-stylex";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    consoleStylex(),
    {
      name: "isolated-operations-fixture",
      async configureServer(server) {
        const backend = await operationsFixture();
        server.httpServer?.on("close", () => {
          void backend.close();
        });
        const handle = async (
          request: IncomingMessage,
          response: ServerResponse
        ) => {
          try {
            let raw = "";
            for await (const chunk of request) {
              raw += chunk;
              if (raw.length > 16384) {
                throw new Error("bounded");
              }
            }
            const body = JSON.parse(raw);
            const value = body.control
              ? backend.control(body.control)
              : await backend.invoke(body);
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify(value));
          } catch {
            response.statusCode = 403;
            response.end("Unavailable");
          }
        };
        server.middlewares.use("/fixture-api", (request, response) => {
          void handle(request, response);
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 18462, strictPort: true },
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    include: [
      "@lenso/ui",
      "use-sync-external-store/shim",
      "use-sync-external-store/shim/with-selector",
      "react-grid-layout",
      "react-resizable",
    ],
  },
});
