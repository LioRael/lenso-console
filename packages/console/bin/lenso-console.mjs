#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, accessSync, realpathSync, constants } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const own = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url))
);
const help = `Usage: lenso-console [--port <1-65535>] [--no-open]

Starts Console without downloading or starting Agent.
Agent connections and MCP management are configured independently by the Host.
Default URL: http://127.0.0.1:3030
`;

export const parseArgs = (args) => {
  if (args.length === 1 && ["--version", "-v"].includes(args[0])) {
    return { version: true };
  }
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    return { help: true };
  }
  const result = { open: true, port: 3030 };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--no-open") {
      result.open = false;
    } else if (args[i] === "--port") {
      const value = args[(i += 1)];
      if (
        !/^\d+$/u.test(value ?? "") ||
        Number(value) < 1 ||
        Number(value) > 65535
      ) {
        throw new Error("--port requires an integer from 1 to 65535.");
      }
      result.port = Number(value);
    } else {
      throw new Error(`Unknown option: ${args[i]}`);
    }
  }
  return result;
};

export const resolveRuntime = (
  platform = process.platform,
  arch = process.arch,
  resolvePackage = (name) => require.resolve(name)
) => {
  const target = `${platform}-${arch}`;
  if (!["darwin-arm64", "linux-x64"].includes(target)) {
    throw new Error(
      `Unsupported platform: ${target}. Supported: macOS arm64 and Linux x64.`
    );
  }
  if (platform === "linux") {
    const libc = process.report.getReport().header.glibcVersionRuntime;
    const [major, minor] = (libc ?? "0.0").split(".").map(Number);
    if (major < 2 || (major === 2 && minor < 39)) {
      throw new Error(
        "The Linux runtime requires glibc 2.39+ (Ubuntu 24.04+); musl is not supported."
      );
    }
  }
  let manifest;
  try {
    manifest = resolvePackage(`@lenso/console-${target}/package.json`);
  } catch {
    throw new Error(
      `Missing @lenso/console-${target}@${own.version}. Reinstall with npm optional dependencies enabled.`
    );
  }
  const metadata = JSON.parse(readFileSync(manifest));
  if (metadata.version !== own.version) {
    throw new Error(
      `Runtime version mismatch: expected ${own.version}, received ${metadata.version}.`
    );
  }
  const root = dirname(manifest);
  accessSync(join(root, "bin/lenso-console"), constants.X_OK);
  accessSync(join(root, "web/index.html"), constants.R_OK);
  return root;
};

const openBrowser = (url) => {
  const child = spawn(
    process.platform === "darwin" ? "open" : "xdg-open",
    [url],
    { stdio: "ignore" }
  );
  child.on("error", () => console.error(`Open ${url} in your browser.`));
  child.on("exit", (code) => {
    if (code) {
      console.error(`Open ${url} in your browser.`);
    }
  });
  child.unref();
};

export const launch = async (options, runtime) => {
  const child = spawn(join(runtime, "bin", "lenso-console"), [], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      CONSOLE_WEB_ROOT: join(runtime, "web"),
      HTTP_HOST: "127.0.0.1",
      HTTP_PORT: String(options.port),
    },
    stdio: ["inherit", "pipe", "inherit"],
  });
  const killGroup = () => {
    if (!child.pid) {
      return;
    }
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") {
        console.error(error.message);
      }
    }
  };
  process.on("exit", killGroup);
  let timedOut = false;
  let stopped = false;
  let ready = false;
  let buffer = "";
  let forceTimer;
  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    child.kill("SIGTERM");
    forceTimer = setTimeout(killGroup, 10000);
    forceTimer.unref();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const timeout = setTimeout(() => {
    timedOut = true;
    console.error(
      "Console startup timed out. Check the Host diagnostics above."
    );
    stop();
  }, 120000);
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      const url = `http://127.0.0.1:${options.port}`;
      if (!ready && line === `Lenso Console listening on ${url}`) {
        ready = true;
        clearTimeout(timeout);
        if (
          options.open &&
          !process.env.SSH_CONNECTION &&
          !process.env.SSH_TTY &&
          !process.env.SSH_CLIENT
        ) {
          openBrowser(url);
        }
      }
    }
    if (buffer.length > 65536) {
      buffer = buffer.slice(-65536);
    }
  });
  try {
    const [code] = await once(child, "exit");
    if (timedOut) {
      return 1;
    }
    if (stopped) {
      return 0;
    }
    return code ?? 1;
  } finally {
    killGroup();
    process.off("exit", killGroup);
    clearTimeout(timeout);
    clearTimeout(forceTimer);
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
};

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(help);
    } else if (options.version) {
      console.log(own.version);
    } else {
      process.exitCode = await launch(options, resolveRuntime());
    }
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}
