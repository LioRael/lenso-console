import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const writeConsoleDevRegistry = async ({ registryPath, targets }) => {
  const registry = {
    bundles: targets.map((target) => ({
      entry: `/console/extensions/dev/${bundleBaseName(target)}.js`,
      exportName: target.exportName,
      hostApi: target.hostApi ?? "1",
      moduleName: target.moduleName,
      packageName: target.packageName,
      requiredCapabilities: target.requiredCapabilities ?? [],
      styles: [`/console/extensions/dev/${bundleBaseName(target)}.css`],
    })),
    version: 1,
  };
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
};

export const bundleBaseName = (target) =>
  target.packageName
    .split("/")
    .at(-1)
    .replaceAll(/[^a-zA-Z0-9_-]/gu, "-");
