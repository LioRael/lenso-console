import { readFile } from "node:fs/promises";

import { build } from "esbuild";

const directory = import.meta.dirname;
const output = "../crates/lenso-management-http/src/workers/mcp.mjs";
const generated = await build({
  absWorkingDir: directory,
  bundle: true,
  entryPoints: ["transport.mjs"],
  format: "esm",
  legalComments: "inline",
  outfile: output,
  platform: "browser",
  target: "es2022",
  write: false,
});
const checked = await readFile(new URL(output, import.meta.url));
if (!checked.equals(Buffer.from(generated.outputFiles[0].contents))) {
  throw new Error("workers_mcp_bundle_drift");
}
console.log("Workers MCP owner bundle matches locked source inputs");
