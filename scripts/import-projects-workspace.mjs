import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const [source] = process.argv.slice(2);
if (!source) {
  throw new Error(
    "Usage: node scripts/import-projects-workspace.mjs PROJECTS_WEB_ROOT"
  );
}
const destination = resolve(
  import.meta.dirname,
  "../service/crates/lenso-console-projects-workspace-plugin/assets"
);
mkdirSync(destination, { recursive: true });
const files = {};
for (const name of ["workspace.js", "workspace.css"]) {
  const content = readFileSync(resolve(source, "src/workspace", name));
  files[name] = createHash("sha256").update(content).digest("hex");
  writeFileSync(resolve(destination, name), content);
}
writeFileSync(
  resolve(destination, "manifest.json"),
  `${JSON.stringify(
    {
      build: "npm ci --prefix web && npm run build --prefix web",
      sha256: files,
      source: "LioRael/lenso-projects-web-plugin",
    },
    null,
    2
  )}\n`
);
