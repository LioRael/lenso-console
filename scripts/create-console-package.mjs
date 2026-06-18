import path from "node:path";

import { runLensoCli } from "./run-lenso-cli.mjs";

const runtimeConsoleRoot = path.resolve(import.meta.dirname, "..");
const cliArgs = process.argv.slice(2);
if (!cliArgs.includes("--runtime-console-root")) {
  cliArgs.push("--runtime-console-root", runtimeConsoleRoot);
}

await runLensoCli(["console-package", "create", ...cliArgs]);
