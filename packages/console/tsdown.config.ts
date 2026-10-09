import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/auth.ts"],
  platform: "neutral",
  dts: true,
  clean: true,
});
