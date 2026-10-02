import { execFileSync } from "node:child_process";
import path from "node:path";

const metadata = JSON.parse(
  execFileSync(
    process.env.CARGO || "cargo",
    [
      "metadata",
      "--locked",
      "--format-version",
      "1",
      "--manifest-path",
      "plugins/console/Cargo.toml",
    ],
    { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 }
  )
);
const packages = metadata.packages.filter(
  (entry) => entry.name === "lenso-capability-human-api-token"
);
if (packages.length !== 1) {
  throw new Error("Human token projection requires one exact owner source");
}
const [owner] = packages;
const generator =
  process.env.LENSO_CONTRACT_CODEGEN || "lenso-contract-codegen";
execFileSync(
  generator,
  [
    process.argv.includes("--update") ? "generate" : "check",
    path.join(path.dirname(owner.manifest_path), "capability.json"),
    "--typescript",
    "apps/shell/src/features/management/generated/human-api-token.ts",
  ],
  { stdio: "inherit" }
);
