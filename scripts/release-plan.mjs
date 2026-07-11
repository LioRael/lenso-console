#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const verifying = args.includes("--verify");
const checkingIntent = args.includes("--check-intent");
const releaseConfig = JSON.parse(
  await readFile(
    new URL("../.lenso-release/config.json", import.meta.url),
    "utf-8"
  )
);
const repository =
  value("--repository") ??
  process.env.GITHUB_REPOSITORY ??
  releaseConfig.repository;
let sourceCommit =
  value("--source-commit") ??
  process.env.GITHUB_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim();

if (verifying) {
  const plan = JSON.parse(
    await readFile(
      new URL("../.lenso-release/plan.json", import.meta.url),
      "utf-8"
    )
  );
  ({ sourceCommit } = plan);
}
if (!repository) {
  throw new Error(
    "release planning requires --repository or GITHUB_REPOSITORY"
  );
}
if (!sourceCommit) {
  throw new Error("release planning requires --source-commit or GITHUB_SHA");
}

process.env.GITHUB_REPOSITORY = repository;
process.env.GITHUB_SHA = sourceCommit;
const [node, script] = process.argv;
process.argv = [node, script, "plan"];

try {
  await import("../.lenso-release/runtime/lib/repository/cli.js");
} catch (error) {
  if (
    checkingIntent &&
    String(error).includes("draft contains no release changes")
  ) {
    process.exit(0);
  }
  throw error;
}
