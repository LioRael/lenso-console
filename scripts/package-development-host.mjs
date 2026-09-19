import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) {
    throw new Error(`Missing ${name}`);
  }
  return path.resolve(args[index + 1]);
};
const engine = option("--engine-host");
const distribution = option("--host-distribution");
const out = option("--out");
if (fs.existsSync(out)) {
  throw new Error("Development package output already exists");
}
const sha = (file) =>
  `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
const info = JSON.parse(
  execFileSync(engine, ["--engine-host-info"], { encoding: "utf-8" })
);
const lock = JSON.parse(
  fs.readFileSync(
    path.join(distribution, ".lenso/distribution.lock.json"),
    "utf-8"
  )
);
if (
  info.schema !== "lenso.engine-host.v1" ||
  lock.schema !== "lenso.local-host-distribution.v1" ||
  lock.target !== info.target
) {
  throw new Error("Host target/protocol mismatch");
}
for (const name of [".lenso/host", "runtime/bun"]) {
  const proof = lock.files.find((file) => file.path === name);
  if (!proof || sha(path.join(distribution, name)) !== proof.sha256) {
    throw new Error(`Invalid distribution artifact: ${name}`);
  }
}
const sources = JSON.parse(
  fs.readFileSync(path.join(distribution, "local-sources.json"), "utf-8")
);
const support = path.join(repo, "packages/console-support");
const packageVersion = (project, label) => {
  const toml = fs.readFileSync(path.join(project, "Cargo.toml"), "utf-8");
  const packageStart = toml.indexOf("[package]\n");
  const nextSection = toml.indexOf("\n[", packageStart + 1);
  const packageSection = toml.slice(
    packageStart,
    nextSection === -1 ? undefined : nextSection
  );
  const version = packageSection.match(
    /^version\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"\s*$/mu
  )?.[1];
  if (!version) {
    throw new Error(`${label} must declare a direct semver package version`);
  }
  return version;
};
const supportVersion = packageVersion(support, "Console support");
if (
  supportVersion !==
  packageVersion(path.join(repo, "service"), "Console runtime Plugin")
) {
  throw new Error(
    "Console support release must match the linked runtime Plugin"
  );
}
const excluded = new Set([
  ".git",
  ".lenso",
  "target",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".venv",
  "__pycache__",
  "Cargo.lock",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
]);
const size = (n) => {
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(BigInt(n));
  return value;
};
const inputDigest = (root) => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (excluded.has(entry.name)) {
        continue;
      }
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error("Source symlinks are not supported");
      }
      if (entry.isDirectory()) {
        walk(file);
      } else {
        files.push(file);
      }
    }
  };
  walk(root);
  const hash = crypto.createHash("sha256");

  for (const file of files.toSorted()) {
    const relative = Buffer.from(path.relative(root, file));
    const bytes = fs.readFileSync(file);
    hash
      .update(size(relative.length))
      .update(relative)
      .update(size(bytes.length))
      .update(bytes);
  }
  return `sha256:${hash.digest("hex")}`;
};
const supportDigest = inputDigest(support);
if (sources.source_digests["lenso.console.web"] !== supportDigest) {
  throw new Error("Console support changed since the Host was built");
}
fs.mkdirSync(path.join(out, "bin"), { recursive: true });
for (const [source, target] of [
  [engine, "bin/lenso-engine-host"],
  [path.join(distribution, ".lenso/host"), "console-host"],
  [path.join(distribution, "runtime/bun"), "bin/bun"],
]) {
  fs.copyFileSync(source, path.join(out, target));
  fs.chmodSync(path.join(out, target), 0o755);
}
for (const name of [
  "console-support",
  "console-convention",
  "console-sdk",
  "console-dev",
]) {
  fs.cpSync(
    path.join(repo, "packages", name),
    path.join(out, "packages", name),
    {
      filter: (source) => !excluded.has(path.basename(source)),
      recursive: true,
    }
  );
}
const contract =
  "contracts/crates/lenso-capability-ui-contribution/generated/bindings.ts";
fs.mkdirSync(path.dirname(path.join(out, contract)), { recursive: true });
fs.copyFileSync(path.join(repo, contract), path.join(out, contract));
fs.writeFileSync(
  path.join(out, "host.json"),
  JSON.stringify(
    {
      executable: "console-host",
      schema: "lenso.precompiled-host.v1",
      sha256: sha(path.join(out, "console-host")),
      sources: {
        "lenso.console.web": {
          companions: ["lenso.web-ingress"],
          input_digest: supportDigest,
          release_version: supportVersion,
        },
      },
      target: info.target,
    },
    null,
    2
  )
);
fs.writeFileSync(
  path.join(out, "bin/lenso"),
  `#!/bin/sh
set -eu
kit=$(CDPATH= cd -- "\${0%/*}/.." && pwd)
export PATH="$kit/bin\${PATH:+:$PATH}"
if [ "\${1:-}" = app ] && [ "\${2:-}" = create ] && [ "\${4:-}" = --console ]; then
  exec "$kit/bin/bun" "$kit/packages/console-dev/create-app.mjs" "$3"
fi
exec "$kit/bin/lenso-engine-host" "$@"
`,
  { mode: 0o755 }
);
fs.copyFileSync(
  path.join(repo, "packages/console-dev/README.md"),
  path.join(out, "README.md")
);
console.log(`Packaged Console development Host for ${info.target}: ${out}`);
