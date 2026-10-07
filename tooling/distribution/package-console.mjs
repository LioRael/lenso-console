import { realpathSync } from "node:fs";
import { chmod, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const targets = ["darwin-arm64", "linux-x64"];

// Only built Console files enter this closure. No Agent resolution or download.
export const packageConsole = async (target, binary, webRoot, destination) => {
  if (!targets.includes(target) || !binary || !webRoot || !destination) {
    throw new Error(
      "Usage: package-console.mjs <darwin-arm64|linux-x64> <console-binary> <web-root> <output-directory>"
    );
  }
  if (target !== `${process.platform}-${process.arch}`) {
    throw new Error("Build and package on the target platform.");
  }
  await readFile(join(resolve(webRoot), "index.html"));
  const { version } = JSON.parse(
    await readFile(join(root, "plugins/console/shell/package.json"))
  );
  const output = resolve(destination);
  const platform = join(output, `console-${target}`);
  await mkdir(output, { recursive: true });
  await mkdir(platform);
  await mkdir(join(platform, "bin"));
  await cp(resolve(binary), join(platform, "bin/lenso-console"));
  await chmod(join(platform, "bin/lenso-console"), 0o755);
  await cp(resolve(webRoot), join(platform, "web"), { recursive: true });
  await cp(join(root, "LICENSE"), join(platform, "LICENSE"));
  const metadata = {
    cpu: [target.split("-")[1]],
    description: `Lenso Console Host for ${target}; no Agent runtime.`,
    files: ["bin", "web", "README.md"],
    license: "MIT",
    name: `@lenso/console-${target}`,
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
    join(platform, "README.md"),
    "# Console runtime\n\nExact-version runtime of @lenso/console. Contains no Agent executable.\n"
  );
  const launcher = join(output, "console");
  await mkdir(launcher);
  await cp(join(root, "packages/console"), launcher, { recursive: true });
  await cp(join(root, "LICENSE"), join(launcher, "LICENSE"));
  const manifest = JSON.parse(await readFile(join(launcher, "package.json")));
  delete manifest.private;
  manifest.version = version;
  manifest.optionalDependencies = Object.fromEntries(
    targets.map((item) => [`@lenso/console-${item}`, version])
  );
  await writeFile(
    join(launcher, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await chmod(join(launcher, "bin/lenso-console.mjs"), 0o755);
  return { launcher, platform, version };
};

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  const result = await packageConsole(...process.argv.slice(2));
  console.log(`Prepared @lenso/console@${result.version}`);
}
