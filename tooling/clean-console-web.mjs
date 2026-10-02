import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const shell = resolve(import.meta.dirname, "../apps/shell");
await Promise.all(
  [".output", "dist"].map((name) =>
    rm(resolve(shell, name), { force: true, recursive: true })
  )
);
