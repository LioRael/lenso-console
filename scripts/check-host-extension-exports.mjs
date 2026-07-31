import { readFile } from "node:fs/promises";

const jsxRuntime = await import("../dist/extensions/host/react-jsx-runtime.js");
const hostApi = await import("../dist/extensions/host/console-package-api.js");

if (hostApi.CONSOLE_HOST_API_VERSION !== "1") {
  throw new TypeError("console host API version export is missing");
}
if (
  typeof hostApi.Button !== "function" ||
  typeof hostApi.Tabs?.Tab !== "function"
) {
  throw new TypeError("console shared UI exports are missing");
}

for (const name of ["Fragment", "jsx", "jsxs"]) {
  if (jsxRuntime[name] === undefined) {
    throw new TypeError(`missing react-jsx-runtime export: ${name}`);
  }
}

if (
  hostApi.consoleHostApi.routing.buildPath("/runtime/stories", {
    story: "abc",
  }) !== "/runtime/stories?story=abc"
) {
  throw new Error("consoleHostApi export is not the host adapter");
}

const index = await readFile("dist/index.html", "utf-8");
const app = index.match(/assets\/app-[^"]+\.js/u)?.[0];
const styles = index.match(/assets\/app-[^"]+\.css/u)?.[0];
if (!app) {
  throw new Error("missing app asset in dist/index.html");
}
if (!styles) {
  throw new Error("missing app stylesheet in dist/index.html");
}
const appText = await readFile(`dist/${app}`, "utf-8");
if (
  appText.includes("Console host API is only available inside Lenso Console")
) {
  throw new Error("placeholder host API leaked into app asset");
}

const stylesText = await readFile(`dist/${styles}`, "utf-8");
for (const contractMarker of [
  ".lenso-ui-button",
  ".lenso-ui-tabs__tab",
  "--control-height-sm",
]) {
  if (!stylesText.includes(contractMarker)) {
    throw new Error(`missing Console theme contract: ${contractMarker}`);
  }
}
