import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pages = ["audit", "api-keys", "authorization", "tasks", "scheduler"];
const output = path.join(root, ".generated");
const compiler = fileURLToPath(
  new URL("../../console-authoring/compiler/compiler.mjs", import.meta.url)
);
const hash = createHash("sha256");
const source = (directory) => {
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .toSorted((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      source(file);
    } else {
      hash.update(file.slice(root.length));
      hash.update(fs.readFileSync(file));
    }
  }
};
source(path.join(root, "pages"));
source(path.dirname(compiler));
source(fileURLToPath(new URL("../../console-authoring/src/", import.meta.url)));
hash.update(fs.readFileSync(path.join(root, "../../pnpm-lock.yaml")));
const fingerprint = hash.digest("hex");
const generated = path.join(output, "management-assets.json");
const stamp = path.join(output, "pages-fingerprint");
if (
  fs.existsSync(generated) &&
  fs.existsSync(stamp) &&
  fs.readFileSync(stamp, "utf-8") === fingerprint
) {
  console.log("Management page assets are current");
} else {
  const result = {};
  for (const capability of pages) {
    const destination = path.join(output, capability);
    fs.mkdirSync(destination, { recursive: true });
    execFileSync("bun", [compiler], {
      input: JSON.stringify({
        schema: "lenso.convention-compile.v1",
        entry: path.join(root, "pages", capability),
        output: destination,
        plugin_id: capability,
        options: {},
      }),
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["pipe", "pipe", "inherit"],
    });
    const descriptor = JSON.parse(
      fs.readFileSync(path.join(destination, "descriptor.json"), "utf-8")
    );
    result[capability] = {
      revision: descriptor.revision,
      module: descriptor.module,
      styles: descriptor.styles,
      assets: descriptor.assets,
    };
  }
  fs.writeFileSync(generated, JSON.stringify(result));
  fs.writeFileSync(stamp, fingerprint);
  console.log(
    "Built five optional management pages with the Console SDK compiler"
  );
}
