import fs from "node:fs";
import path from "node:path";

const replaceOnce = (source, before, after) => {
  if (source.split(before).length !== 2) {
    throw new Error(`Console preview seam changed: ${before}`);
  }
  return source.replace(before, after);
};

/** Stage the current official Shell, with development-only adapters. */
export const preparePreview = (repo, sdk) => {
  const source = path.join(repo, "plugins/console/shell/src");
  const destination = path.join(sdk, "dev/shell");
  fs.rmSync(destination, { force: true, recursive: true });
  fs.rmSync(path.join(sdk, "dev/shared"), { force: true, recursive: true });
  fs.mkdirSync(destination, { recursive: true });
  const copy = (directory, relative = "") => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.name.includes(".test.") || item.name === "__screenshots__") {
        continue;
      }
      const name = path.join(relative, item.name);
      const file = path.join(directory, item.name);
      const target = path.join(destination, name);
      if (item.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        copy(file, name);
      } else if (item.isFile()) {
        let text = fs.readFileSync(file, "utf-8");
        text = text.replaceAll(
          /(["'])(\.\.\/[^"']+)\1/gu,
          (match, quote, reference) => {
            const resolved = path.resolve(path.dirname(file), reference);
            if (resolved.startsWith(source + path.sep)) {
              return match;
            }
            let mapped;
            if (
              resolved.startsWith(
                path.join(repo, "packages/console-authoring/src/")
              )
            ) {
              mapped = path.join(
                sdk,
                "src",
                path.relative(
                  path.join(repo, "packages/console-authoring/src"),
                  resolved
                )
              );
            } else if (resolved.startsWith(path.join(repo, "contracts/"))) {
              mapped = path.join(
                sdk,
                "dev/shared",
                path.relative(repo, resolved)
              );
              fs.mkdirSync(path.dirname(mapped), { recursive: true });
              fs.copyFileSync(`${resolved}.ts`, `${mapped}.ts`);
            } else {
              throw new Error(
                `Unpackaged Shell dependency: ${reference} in ${name}`
              );
            }
            let local = path
              .relative(path.dirname(target), mapped)
              .replaceAll(path.sep, "/");
            if (!local.startsWith(".")) {
              local = `./${local}`;
            }
            return `${quote}${local}${quote}`;
          }
        );
        if (name === "routeTree.gen.ts") {
          text = replaceOnce(
            text,
            "from './routes/__root'",
            "from '../browser-root'"
          );
        }
        if (name === "features/extensions/page-contribution-catalog.ts") {
          text = `import { previewMounts, selectPreviewMounts } from "virtual:lenso-preview";\n${
            text
          }`;
          text = replaceOnce(
            text,
            "return demoCatalog;",
            "return previewMounts;"
          );
          text = replaceOnce(
            text,
            "return mounts.filter((mount) => !mount.transport?.signal.aborted);",
            "return selectPreviewMounts(mounts.filter((mount) => !mount.transport?.signal.aborted));"
          );
        }
        if (name === "features/extensions/page-mount-runtime.ts") {
          text = `import PreviewPage from "virtual:lenso-preview-page";\nimport { isPreviewMount } from "virtual:lenso-preview";\n${
            text
          }`;
          text = replaceOnce(
            text,
            "  const baseKey = implementationKey(mount);",
            "  if (isPreviewMount(mount)) return Promise.resolve({ apiMajor: 1, createWorkspace: () => ({ Page: PreviewPage }) });\n  const baseKey = implementationKey(mount);"
          );
        }
        if (name === "features/extensions/workspace-service-client.ts") {
          text = `import { isUiPreview, exampleServices } from "virtual:lenso-preview";\n${
            text
          }`;
          text = replaceOnce(
            text,
            '  if (mount.protocol !== "lenso-console-rpc/2") {',
            '  if (isUiPreview) return exampleServices(lifetime);\n  if (mount.protocol !== "lenso-console-rpc/2") {'
          );
        }
        if (name === "app/console-session.tsx") {
          text = replaceOnce(
            text,
            'if (consoleDevConfig.mode === "mock") {',
            'if (consoleDevConfig.mode === "mock") {\n          setAccess({ administrator: true, assistantEnabled: false, managementEnabled: false, humanManagementEnabled: false, workspaceIds: [] });'
          );
        }
        if (name === "features/apps/app-management-context.tsx") {
          text = replaceOnce(text, "return demoApps;", "return [];");
        }
        fs.writeFileSync(target, text);
      } else {
        throw new Error(`Shell source must be a regular file: ${file}`);
      }
    }
  };
  copy(source);
  fs.copyFileSync(
    path.join(repo, "plugins/console/shell/public/favicon.svg"),
    path.join(sdk, "dev/favicon.svg")
  );
};

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const repo = path.resolve(import.meta.dirname, "../..");
  preparePreview(repo, path.join(repo, "packages/console-authoring"));
}
