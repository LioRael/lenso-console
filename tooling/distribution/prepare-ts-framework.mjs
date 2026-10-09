import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const pin = JSON.parse(
  fs.readFileSync(new URL("framework-source.json", import.meta.url), "utf-8")
);
if (
  pin.repository !== "https://github.com/LioRael/lenso.git" ||
  !/^[a-f0-9]{40}$/u.test(pin.revision)
) {
  throw new Error("Framework preparation requires a pinned TS Lenso commit");
}
const bun = fs
  .readFileSync(new URL("../../.bun-version", import.meta.url), "utf-8")
  .trim();
if (execFileSync("bun", ["--version"], { encoding: "utf-8" }).trim() !== bun) {
  throw new Error(`Framework preparation requires Bun ${bun}`);
}
const [framework, ...extra] = process.argv.slice(2);
if (extra.length) {
  throw new Error("Use only an optional clean checkout at the pinned revision");
}
const destination = path.resolve(".artifacts/framework");
const root = framework
  ? path.resolve(framework)
  : path.join(destination, "sources", pin.revision);
if (!framework && !fs.existsSync(root)) {
  fs.mkdirSync(path.dirname(root), { recursive: true });
  execFileSync(
    "git",
    ["clone", "--no-checkout", "--filter=blob:none", pin.repository, root],
    {
      stdio: "inherit",
    }
  );
  execFileSync("git", ["fetch", "--depth=1", "origin", pin.revision], {
    cwd: root,
    stdio: "inherit",
  });
  execFileSync("git", ["checkout", "--detach", pin.revision], {
    cwd: root,
    stdio: "inherit",
  });
}
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf-8",
}).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], {
  cwd: root,
  encoding: "utf-8",
}).trim();
if (source !== pin.revision || dirty) {
  throw new Error(
    "Framework checkout must be clean at the pinned source commit; no reset or patch fallback is performed"
  );
}
if (
  JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")).name !==
  "lenso-workspace"
) {
  throw new Error("The source must be the TypeScript Lenso workspace");
}
const buildOrder = [
  "lenso",
  "otel",
  "web",
  "auth",
  "engine",
  "manage",
  "tasks",
  "db",
  "log",
  "audit",
  "authorization",
  "scheduler",
  "api-keys",
  "limits",
];
fs.mkdirSync(destination, { recursive: true });
execFileSync("bun", ["install", "--frozen-lockfile", "--ignore-scripts"], {
  cwd: root,
  stdio: "inherit",
});

const artifacts = [];
for (const name of buildOrder) {
  const cwd = path.join(root, "packages", name);
  fs.rmSync(path.join(cwd, "dist"), { force: true, recursive: true });
  execFileSync("bun", ["run", "build"], { cwd, stdio: "inherit" });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(cwd, "package.json"), "utf-8")
  );
  execFileSync("bun", ["pm", "pack", "--destination", destination], {
    cwd,
    stdio: "inherit",
  });
  const packed = `${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`;
  const filename = packed.replace(".tgz", `-${source}.tgz`);
  fs.renameSync(
    path.join(destination, packed),
    path.join(destination, filename)
  );
  artifacts.push({
    filename,
    package: manifest.name,
    sha256: createHash("sha256")
      .update(fs.readFileSync(path.join(destination, filename)))
      .digest("hex"),
    version: manifest.version,
  });
}
if (
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf-8",
  }).trim() !== source ||
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf-8",
  }).trim()
) {
  throw new Error("Framework source changed while building the archives");
}
fs.writeFileSync(
  path.join(destination, "source.json"),
  `${JSON.stringify(
    {
      artifacts,
      bun,
      repository: pin.repository,
      source,
    },
    null,
    2
  )}\n`
);
