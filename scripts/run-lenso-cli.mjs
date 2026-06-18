import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const pathExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const runCommand = async (command, args, options = {}) => {
  const { stderr, stdout } = await execFileAsync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    maxBuffer: 1024 * 1024 * 32,
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
};

export const runLensoCli = async (args, options = {}) => {
  if (process.env.LENSO_CLI) {
    await runCommand(process.env.LENSO_CLI, args, options);
    return;
  }

  const lensoRepoRoot = process.env.LENSO_REPO_ROOT
    ? path.resolve(process.env.LENSO_REPO_ROOT)
    : path.resolve(import.meta.dirname, "../../lenso");
  const lensoManifestPath = path.join(lensoRepoRoot, "Cargo.toml");
  if (await pathExists(lensoManifestPath)) {
    await runCommand(
      "cargo",
      [
        "run",
        "--quiet",
        "--manifest-path",
        lensoManifestPath,
        "-p",
        "lenso-cli",
        "--",
        ...args,
      ],
      options
    );
    return;
  }

  await runCommand("lenso", args, options);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runLensoCli(process.argv.slice(2));
}
