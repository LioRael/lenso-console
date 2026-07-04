#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { discoverConsoleDevTargets } from "./console-dev/discovery.mjs";
import {
  bundleBaseName,
  writeConsoleDevRegistry,
} from "./console-dev/registry.mjs";

const spawnPackageWatcher = ({ outputDir, target }) => {
  const baseName = bundleBaseName(target);
  return spawn(
    "pnpm",
    [
      "exec",
      "vite",
      "build",
      "--watch",
      "--emptyOutDir=false",
      "--outDir",
      outputDir,
    ],
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
  console.error(`Console: http://localhost:${cliArgs.port}/console/launchpad`);

  return spawn(
    "pnpm",
    ["exec", "vite", "--host", "0.0.0.0", "--port", String(cliArgs.port)],
    {
      cwd: root,
      env: {
        ...process.env,
        LENSO_CONSOLE_BASE: "/console/",
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

  const children = targets.map((target) =>
    spawnPackageWatcher({ outputDir, target })
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
