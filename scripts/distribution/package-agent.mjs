import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const [target, binary, destination] = process.argv.slice(2);
const targets = {
  "darwin-arm64": "darwin-aarch64",
  "linux-x64": "linux-x86_64",
};
if (!targets[target] || !binary || !destination) {
  throw new Error(
    "Usage: package-agent.mjs <darwin-arm64|linux-x64> <console-binary> <output-directory>"
  );
}
const { version } = JSON.parse(await readFile(join(root, "package.json")));
const cohort = JSON.parse(
  await readFile(join(root, "scripts/distribution/agent-release.json"))
);
if (target !== `${process.platform}-${process.arch}`) {
  throw new Error(
    "Build and package on the target platform; cross-target packaging is unsupported."
  );
}
const output = resolve(destination);
const platform = join(output, `agent-${target}`);
await mkdir(output, { recursive: true });
await mkdir(platform);
await mkdir(join(platform, "bin"));
await cp(join(root, "LICENSE"), join(platform, "LICENSE"));
await cp(resolve(binary), join(platform, "bin/lenso-console-with-agent"));
await chmod(join(platform, "bin/lenso-console-with-agent"), 0o755);
await cp(join(root, "dist/client"), join(platform, "web"), { recursive: true });
await readFile(join(platform, "web/index.html"));
const temporary = await mkdtemp(join(tmpdir(), "lenso-agent-package-"));
try {
  for (const executable of [
    "lenso-agent",
    "lenso-agent-cli",
    "lenso-agent-acp",
    "lenso-agent-web",
    "lenso-agent-console-web",
  ]) {
    const name = `${executable}-v${cohort.version}-${targets[target]}.tar.gz`;
    const checksum = cohort.assets[name];
    if (!/^[a-f0-9]{64}$/u.test(checksum ?? "")) {
      throw new Error(`Missing pinned checksum: ${name}`);
    }
    const response = await fetch(
      `https://github.com/${cohort.repository}/releases/download/v${cohort.version}/${name}`,
      { signal: AbortSignal.timeout(120000) }
    );
    if (!response.ok) {
      throw new Error(`Download failed (${response.status}): ${name}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== checksum) {
      throw new Error(`Checksum mismatch: ${name}`);
    }
    const archive = join(temporary, name);
    await writeFile(archive, bytes);
    const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf-8" });
    if (listing.status !== 0 || listing.stdout.trim() !== executable) {
      throw new Error(`Unexpected archive contents: ${name}`);
    }
    const extracted = spawnSync(
      "tar",
      ["-xzf", archive, "-C", join(platform, "bin")],
      { stdio: "inherit" }
    );
    if (extracted.status !== 0) {
      throw new Error(`Cannot extract ${name}`);
    }
    await chmod(join(platform, "bin", executable), 0o755);
  }
} finally {
  await rm(temporary, { force: true, recursive: true });
}
const metadata = {
  cpu: [target.split("-")[1]],
  description: `Lenso Agent terminal and Web runtime for ${target}.`,
  files: ["bin", "web", "cohort.json", "README.md"],
  license: "MIT",
  name: `@lenso/agent-${target}`,
  os: [target.split("-")[0]],
  publishConfig: { access: "public" },
  repository: {
    type: "git",
    url: "git+https://github.com/LioRael/lenso-console.git",
  },
  version,
};
await writeFile(
  join(platform, "package.json"),
  `${JSON.stringify(metadata, null, 2)}\n`
);
await writeFile(
  join(platform, "cohort.json"),
  `${JSON.stringify({ agent: cohort, consoleVersion: version }, null, 2)}\n`
);
await writeFile(
  join(platform, "README.md"),
  `# Lenso Agent ${target}\n\nExact-version runtime dependency of @lenso/agent. Install the launcher rather than this package directly.\n`
);
const launcher = join(output, "agent");
await cp(join(root, "packages/agent"), launcher, { recursive: true });
await cp(join(root, "LICENSE"), join(launcher, "LICENSE"));
const manifest = JSON.parse(await readFile(join(launcher, "package.json")));
delete manifest.private;
manifest.version = version;
manifest.optionalDependencies = Object.fromEntries(
  Object.keys(targets).map((item) => [`@lenso/agent-${item}`, version])
);
await writeFile(
  join(launcher, "package.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);
await chmod(join(launcher, "bin/lenso-agent.mjs"), 0o755);
console.log(
  `Prepared ${metadata.name}@${version} and @lenso/agent@${version} in ${output}`
);
