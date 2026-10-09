import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/auth.ts",
    "src/pages.ts",
    "src/integrations/audit.ts",
    "src/integrations/authorization.ts",
    "src/integrations/api-keys.ts",
    "src/integrations/limits.ts",
    "src/integrations/tasks.ts",
    "src/integrations/scheduler.ts",
  ],
  platform: "neutral",
  dts: true,
  clean: true,
});
