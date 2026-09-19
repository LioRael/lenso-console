import fs from "node:fs";
import path from "node:path";

const kit = path.resolve(import.meta.dir, "../..");
const args = process.argv.slice(2);
if (args.length !== 1 || args[0].startsWith("-")) {
  throw new Error("Usage: lenso app create <directory> --console");
}
const root = path.resolve(args[0]);
if (fs.existsSync(root)) {
  throw new Error(`App directory already exists: ${root}`);
}
fs.mkdirSync(path.join(root, "app/orders/console"), { recursive: true });
fs.mkdirSync(path.join(root, "plugins/lenso.console.web"), { recursive: true });
fs.writeFileSync(
  path.join(root, "plugins/lenso.console.web/default.toml"),
  "# This App owns its Console.\n"
);
fs.writeFileSync(
  path.join(root, "lenso.toml"),
  `development_host = ${JSON.stringify(path.join(kit, "host.json"))}\nplugin_sources = [${JSON.stringify(path.join(kit, "packages/console-support"))}]\n`
);
fs.cpSync(
  path.join(kit, "packages/console-dev/template"),
  path.join(root, "app/orders/console"),
  { recursive: true }
);
fs.writeFileSync(
  path.join(root, ".gitignore"),
  ".lenso/\ndist/\nnode_modules/\n"
);
console.log(
  `Created ${root}\nRun: lenso app dev --root ${JSON.stringify(root)}`
);
