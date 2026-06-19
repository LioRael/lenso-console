import { readFile } from "node:fs/promises";

const jsxRuntime = await import("../dist/extensions/host/react-jsx-runtime.js");
const hostApi = await import("../dist/extensions/host/runtime-console-api.js");

for (const name of ["Fragment", "jsx", "jsxs"]) {
  if (jsxRuntime[name] === undefined) {
    throw new TypeError(`missing react-jsx-runtime export: ${name}`);
  }
}

if (
  hostApi.runtimeConsoleHostApi.routing.buildPath("/runtime/stories", {
    story: "abc",
  }) !== "/runtime/stories?story=abc"
) {
  throw new Error("runtimeConsoleHostApi export is not the host adapter");
}

const index = await readFile("dist/index.html", "utf-8");
const app = index.match(/assets\/app-[^"]+\.js/u)?.[0];
if (!app) {
  throw new Error("missing app asset in dist/index.html");
}
const appText = await readFile(`dist/${app}`, "utf-8");
if (
  appText.includes("Runtime Console host API is only available inside Lenso")
) {
  throw new Error("placeholder host API leaked into app asset");
}
