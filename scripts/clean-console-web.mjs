import { rm } from "node:fs/promises";

await Promise.all(
  [
    "dist/assets",
    "dist/client",
    "dist/favicon.svg",
    "dist/index.html",
    "dist/server",
  ].map((path) => rm(path, { force: true, recursive: true }))
);
