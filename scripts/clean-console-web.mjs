import { rm } from "node:fs/promises";

await Promise.all(
  [".output", "dist"].map((path) => rm(path, { force: true, recursive: true }))
);
