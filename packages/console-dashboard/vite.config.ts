import stylex from "@stylexjs/unplugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [stylex({ dev: false, useCSSLayers: false })],
  build: {
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: {
        react: "src/react.tsx",
        server: "src/server.ts",
        "storage/sqlite": "src/storage/sqlite.ts",
        "storage/postgres": "src/storage/postgres.ts",
        "storage/d1": "src/storage/d1.ts",
        "server-auth": "src/server-auth.ts",
        "server-audit": "src/server-audit.ts",
        contract: "src/contract.ts",
        styles: "src/library-styles.js",
      },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
      cssFileName: "styles",
    },
    rollupOptions: {
      external: (id) =>
        !id.startsWith(".") && !id.startsWith("/") && !id.endsWith(".css"),
    },
  },
});
