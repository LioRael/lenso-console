import fs from "node:fs";
import path from "node:path";

// Preview shares only theme and transport primitives, never application pages.
const sharedFiles = [
  "app/console-appearance.tsx",
  "hooks/use-persisted-layout.ts",
  "lib/console-http-paths.ts",
  "lib/console-query-client.ts",
  "lib/session-fetch.ts",
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
    const text = fs
      .readFileSync(file, "utf-8")
      .replaceAll(/(["'])(\.\.\/[^"']+)\1/gu, (match, quote, reference) => {
        const resolved = path.resolve(path.dirname(file), reference);
        if (resolved.startsWith(source + path.sep)) {
          return match;
        }
        const sdkSource = path.join(repo, "packages/console-authoring/src");
        if (!resolved.startsWith(sdkSource + path.sep)) {
          throw new Error(`Unpackaged preview dependency: ${reference}`);
        }
        const mapped = path.join(
          sdk,
          "src",
          path.relative(sdkSource, resolved)
        );
        const local = path
          .relative(path.dirname(target), mapped)
          .split(path.sep)
          .join("/");
        return `${quote}${local.startsWith(".") ? local : `./${local}`}${quote}`;
      });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
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
