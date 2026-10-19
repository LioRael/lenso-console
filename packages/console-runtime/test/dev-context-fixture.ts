import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function startDevContextFixture(root: string, native: string) {
  const cli = (await import(
    join(root, "node_modules/@lenso/cli/dist/index.js")
  )) as {
    connectDev(
      file: string,
      action: "inspect" | "recent" | "call",
      options?: {
        generation?: string;
        pluginId?: string;
        method?: string;
        limit?: number;
        input?: unknown;
        signal?: AbortSignal;
      }
    ): Promise<unknown>;
  };
  await writeFile(
    join(root, "lenso.config.ts"),
    `import {defineApp,definePlugin} from '@lenso/core';import {defineOperation} from '@lenso/cli';import {z} from 'zod';export const owner=definePlugin({id:'orders-owner',setup(){return {read:async()=>({total:'private-output-value'})}}});export const operations=[defineOperation({plugin:owner,method:'read',input:z.object({}),output:z.object({total:z.number()}),errors:[{code:'orders_unavailable',message:'Orders unavailable'}],description:'Read orders',effect:'read',source:{file:'src/orders.ts',line:12}})];export default defineApp({plugins:[owner]});`
  );
  await writeFile(
    join(root, "entry.ts"),
    `import {startApp} from '@lenso/core';import {serveDevOperations} from '@lenso/cli';import {reportDevReady} from '@lenso/engine/dev-ready';import definition,{operations} from './lenso.config';const app=await startApp(definition);const connection=await serveDevOperations({running:app,plugins:definition.plugins,operations});reportDevReady({connection:connection?.connection});const close=async()=>{await connection?.close();await app.stop();process.exit(0)};process.on('SIGTERM',close);process.on('SIGINT',close);`
  );
  const descriptor = join(root, "dev.json");
  const child = Bun.spawn(
    [
      native,
      "dev",
      "--entry",
      "entry.ts",
      "--root",
      root,
      "--connect",
      descriptor,
      "--json",
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" }
  );
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  const close = async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
    const timeout = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, 5000);
    await child.exited;
    clearTimeout(timeout);
    return { stdout: await stdout, stderr: await stderr };
  };
  try {
    const deadline = Date.now() + 15000;
    let inspection: { instanceId: string; generation: string } | undefined;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        inspection = (await cli.connectDev(
          descriptor,
          "inspect"
        )) as typeof inspection;
        if (inspection) {
          break;
        }
      } catch {
        /* Supervisor has not admitted this generation yet. */
      }
      await Bun.sleep(25);
    }
    if (!inspection) {
      throw new Error("Synthetic dev connection did not become ready.");
    }
    let failure = false;
    try {
      await cli.connectDev(descriptor, "call", {
        generation: inspection.generation,
        pluginId: "orders-owner",
        method: "read",
        input: {},
      });
    } catch {
      failure = true;
    }
    if (!failure) {
      throw new Error("Invalid output fixture unexpectedly succeeded.");
    }
    return {
      inspection,
      read: (
        action: "inspect" | "recent",
        options: {
          generation?: string;
          pluginId?: string;
          method?: string;
          limit?: number;
          signal: AbortSignal;
        }
      ) => cli.connectDev(descriptor, action, options),
      close,
    };
  } catch (error) {
    const logs = await close();
    throw new Error(`${String(error)}: ${logs.stdout} ${logs.stderr}`, {
      cause: error,
    });
  }
}
