#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { discoverConsoleDevTargets } from "./console-dev/discovery.mjs";
import {
  bundleBaseName,
  writeConsoleDevRegistry,
} from "./console-dev/registry.mjs";

const spawnPackageWatcher = ({ configPath, target }) => {
  const baseName = bundleBaseName(target);
  return spawn(
    "pnpm",
    ["exec", "vite", "build", "--watch", "--config", configPath],
    {
      cwd: target.packageRoot,
      env: {
        ...process.env,
        LENSO_CONSOLE_DEV_BUNDLE_BASENAME: baseName,
      },
      stdio: "inherit",
    }
  );
};

const writePackageViteConfig = async ({
  outputDir,
  root,
  target,
  tempRoot,
}) => {
  const baseName = bundleBaseName(target);
  const configPath = path.join(tempRoot, `${baseName}.vite.config.mjs`);
  const entry = await packageEntryPoint(target.packageRoot);
  await writeFile(
    configPath,
    `${packageViteConfigSource({ baseName, entry, outputDir, root, target })}\n`
  );
  return configPath;
};

const packageViteConfigSource = ({
  baseName,
  entry,
  outputDir,
  root,
  target,
}) =>
  `export default {
  build: {
    emptyOutDir: false,
    lib: {
      cssFileName: ${JSON.stringify(baseName)},
      entry: ${JSON.stringify(entry)},
      fileName: () => ${JSON.stringify(`${baseName}.js`)},
      formats: ["es"],
    },
    outDir: ${JSON.stringify(outputDir)},
    sourcemap: true,
    rollupOptions: {
      external: [
        "@lenso/console-package-api",
        "react",
        "react/jsx-dev-runtime",
        "react/jsx-runtime",
      ],
      output: {
        paths: {
          "@lenso/console-package-api": "/console/src/extension-host/console-package-api.ts",
          react: "/console/src/extension-host/react.ts",
          "react/jsx-dev-runtime": "/console/src/extension-host/react-jsx-runtime.ts",
          "react/jsx-runtime": "/console/src/extension-host/react-jsx-runtime.ts",
        },
      },
    },
  },
  resolve: {
    alias: {
      "@lenso/console-package-api": ${JSON.stringify(
        path.join(root, "src/extension-host/console-package-api.ts")
      )},
    },
    dedupe: ["@lenso/console-package-api", "react", "react-dom"],
  },
  root: ${JSON.stringify(target.packageRoot)},
};
`;

const packageEntryPoint = async (packageRoot) => {
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf-8")
  );
  const entry =
    exportEntryPath(packageJson.exports) ??
    stringValue(packageJson.module) ??
    stringValue(packageJson.main) ??
    "src/index.tsx";
  return path.resolve(packageRoot, entry);
};

const exportEntryPath = (exportsField) => {
  if (typeof exportsField === "string") {
    return exportsField;
  }
  if (!exportsField || typeof exportsField !== "object") {
    return null;
  }
  return exportValuePath(exportsField["."] ?? exportsField);
};

const exportValuePath = (value) => {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  return (
    stringValue(value.import) ??
    stringValue(value.default) ??
    stringValue(value.browser) ??
    stringValue(value.require)
  );
};

const stringValue = (value) => (typeof value === "string" ? value : null);

const spawnRuntimeConsole = ({
  cliArgs,
  outputDir,
  registryPath,
  root,
  targets,
}) => {
  const mode = cliArgs.host ? "host" : "mock";
  const targetLabel = targets.map((target) => target.packageName).join(", ");
  console.error("Lenso Console Dev");
  console.error(`Mode: ${mode}`);
  console.error(`Targets: ${targetLabel}`);
  console.error(`Console: http://localhost:${cliArgs.port}/launchpad`);

  return spawn(
    "pnpm",
    ["exec", "vite", "--host", "0.0.0.0", "--port", String(cliArgs.port)],
    {
      cwd: root,
      env: {
        ...process.env,
        LENSO_CONSOLE_DEV_EXTENSIONS_DIR: outputDir,
        LENSO_CONSOLE_DEV_HOST: cliArgs.host ?? "",
        LENSO_CONSOLE_DEV_REGISTRY_FILE: registryPath,
        VITE_API_AUTH_TOKEN: process.env.LENSO_CONSOLE_DEV_AUTH_TOKEN ?? "",
        VITE_API_BASE_URL: cliArgs.host ? "/" : "",
        VITE_CONSOLE_DEV_MODE: mode,
        VITE_CONSOLE_DEV_REGISTRY_URL: "/console/dev/registry.json",
        VITE_CONSOLE_DEV_TARGET_LABEL: targetLabel,
        VITE_RUNTIME_CONSOLE_MODE: cliArgs.host ? "api" : "mock",
      },
      stdio: "inherit",
    }
  );
};

const parseArgs = (rawArgs) => {
  const parsed = {
    cwd: null,
    host: null,
    package: null,
    port: 5174,
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--cwd") {
      parsed.cwd = path.resolve(requiredValue(rawArgs, index, arg));
      index += 1;
    } else if (arg === "--host") {
      parsed.host = requiredValue(rawArgs, index, arg);
      index += 1;
    } else if (arg === "--package") {
      parsed.package = requiredValue(rawArgs, index, arg);
      index += 1;
    } else if (arg === "--port") {
      parsed.port = Number(requiredValue(rawArgs, index, arg));
      index += 1;
    } else {
      throw new Error(`Unknown console dev argument: ${arg}`);
    }
  }
  return parsed;
};

const requiredValue = (rawArgs, index, flag) => {
  const value = rawArgs[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
};

const registerShutdown = (children) => {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      for (const child of children) {
        child.kill(signal);
      }
    });
  }
};

const main = async () => {
  const cliArgs = parseArgs(process.argv.slice(2));
  const root = path.resolve(import.meta.dirname, "..");
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lenso-console-dev-"));
  const outputDir = path.join(tempRoot, "extensions");
  await mkdir(outputDir, { recursive: true });

  const targets = await discoverConsoleDevTargets({
    cwd: cliArgs.cwd ?? process.cwd(),
    packagePath: cliArgs.package,
  });
  const registryPath = path.join(tempRoot, "registry.json");
  await writeConsoleDevRegistry({ registryPath, targets });

  const watcherInputs = await Promise.all(
    targets.map(async (target) => ({
      configPath: await writePackageViteConfig({
        outputDir,
        root,
        target,
        tempRoot,
      }),
      target,
    }))
  );
  const children = watcherInputs.map((input) =>
    spawnPackageWatcher({
      configPath: input.configPath,
      target: input.target,
    })
  );
  children.push(
    spawnRuntimeConsole({
      cliArgs,
      outputDir,
      registryPath,
      root,
      targets,
    })
  );
  registerShutdown(children);
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
