import { build } from "vite";

await build({
  configFile: new URL("vite.config.ts", import.meta.url).pathname,
});
