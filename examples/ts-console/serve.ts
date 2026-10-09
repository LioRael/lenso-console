import path from "node:path";
import { pathToFileURL } from "node:url";

import { startApp, type Plugin } from "@lenso/core";
import {
  applicationConfigPath,
  readApplication,
} from "@lenso/engine/application";
import type { BunListenerService } from "@lenso/web/bun";

export async function startConfiguredHost(configPath: string) {
  const root = path.dirname(path.resolve(configPath));
  const trustedPath = applicationConfigPath({
    root,
    config: path.basename(configPath),
  });
  const application = await readApplication(root, trustedPath);
  return startApp(application.app);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 1) {
    throw new Error(
      "Usage: bun examples/ts-console/serve.ts [trusted/lenso.config.ts]"
    );
  }
  const configPath = args[0] ?? path.join(import.meta.dir, "lenso.config.ts");
  const app = await startConfiguredHost(configPath);
  const module = await import(pathToFileURL(path.resolve(configPath)).href);
  const host = module.host as
    | { listener: Plugin<BunListenerService> }
    | undefined;
  const origin = host ? app.get(host.listener).url.origin : undefined;
  console.log(JSON.stringify({ ready: true, origin }));
  let stopping: Promise<void> | undefined;
  const stop = () => (stopping ??= app.stop());
  const finish = async () => {
    try {
      await stop();
      process.exitCode = 0;
    } catch {
      console.error("TS host cleanup failed");
      process.exitCode = 1;
    }
  };
  process.once("SIGINT", () => {
    void finish();
  });
  process.once("SIGTERM", () => {
    void finish();
  });
}
