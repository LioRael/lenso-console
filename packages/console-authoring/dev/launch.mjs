import path from "node:path";

/** Bun owns declaration/compiler execution; Node owns the supported Vite runtime. */
export async function dev(options) {
  const child = Bun.spawn(
    [
      "node",
      path.join(import.meta.dirname, "server.mjs"),
      JSON.stringify(options),
    ],
    {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, LENSO_CONSOLE_BUN: process.execPath },
    }
  );
  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    process.exitCode = await child.exited;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
