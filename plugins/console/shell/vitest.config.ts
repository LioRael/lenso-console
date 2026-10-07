import stylex from "@stylexjs/unplugin/rollup";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Unit tests need StyleX source lowering, but not the Vite development
  // middleware. The Rollup adapter exposes the same transform without the
  // development server interval, so Vitest can close immediately.
  plugins: [react(), stylex({ dev: false, useCSSLayers: true })],
});
