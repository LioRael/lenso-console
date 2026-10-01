import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const [assetsRoot, destination] = process.argv.slice(2);
if (!assetsRoot || !destination) {
  throw new Error(
    "Usage: package-assistant.mjs <built-assistant-assets> <output-directory>"
  );
}
const { version } = JSON.parse(await readFile(join(root, "package.json")));
const assets = JSON.parse(
  await readFile(join(resolve(assetsRoot), "assets.json"))
);
if (
  !Array.isArray(assets) ||
  assets.length > 64 ||
  !assets.includes("assistant.mjs") ||
  !assets.includes("assistant.css")
) {
  throw new Error("Invalid assistant asset manifest");
}
await mkdir(resolve(destination));
await mkdir(join(resolve(destination), "ui"));
for (const asset of assets) {
  if (
    typeof asset !== "string" ||
    !/^[A-Za-z0-9._-]+\.(mjs|css)$/u.test(asset)
  ) {
    throw new Error("Invalid assistant asset path");
  }
  const bytes = await readFile(join(resolve(assetsRoot), asset));
  if (bytes.length > 1024 * 1024) {
    throw new Error("Assistant asset exceeds one MiB");
  }
  await cp(
    join(resolve(assetsRoot), asset),
    join(resolve(destination), "ui", asset)
  );
}
await cp(
  join(resolve(assetsRoot), "assets.json"),
  join(resolve(destination), "ui/assets.json")
);
await cp(join(root, "LICENSE"), join(resolve(destination), "LICENSE"));
await writeFile(
  join(resolve(destination), "package.json"),
  `${JSON.stringify(
    {
      dependencies: { "@lenso/agent-native": version },
      description:
        "Optional Lenso Console assistant UI; requires the independent Agent runtime.",
      files: ["ui"],
      license: "MIT",
      name: "@lenso/console-assistant",
      version,
    },
    null,
    2
  )}\n`
);
console.log(`Staged independent @lenso/console-assistant@${version}`);
