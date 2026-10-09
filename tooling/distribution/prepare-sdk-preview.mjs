import fs from "node:fs";
import path from "node:path";

// Preview stages theme assets only; runtime primitives are SDK exports.
const sharedFiles = [
  "app/console-appearance.tsx",
  "hooks/use-persisted-layout.ts",
  "styles.css",
  "styles-base.css",
  "styles-reset.css",
];

export const preparePreview = (repo, sdk) => {
  const source = path.join(repo, "plugins/console/shell/src");
  const destination = path.join(sdk, "dev/shell");
  fs.rmSync(destination, { force: true, recursive: true });
  fs.rmSync(path.join(sdk, "dev/shared"), { force: true, recursive: true });
  for (const name of sharedFiles) {
    const file = path.join(source, name);
    const target = path.join(destination, name);
    if (!fs.lstatSync(file).isFile()) {
      throw new Error(`Preview source must be a regular file: ${file}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
  }
  fs.copyFileSync(
    path.join(repo, "plugins/console/shell/public/favicon.svg"),
    path.join(sdk, "dev/favicon.svg")
  );
};

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const repo = path.resolve(import.meta.dirname, "../..");
  preparePreview(repo, path.join(repo, "packages/console-authoring"));
}
