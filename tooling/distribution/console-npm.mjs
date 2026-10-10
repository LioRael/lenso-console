import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForPackage } from "./wait-for-npm-package.mjs";

const owners = [
  ["console-authoring", "@lenso/console-sdk"],
  ["console-react", "@lenso/console-react"],
  ["console-dashboard", "@lenso/console-dashboard"],
  ["auth-console", "@lenso/auth-console"],
  ["console-plugin-manager", "@lenso/console-plugin-manager"],
];
const hash = (bytes, algorithm = "sha256", encoding = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding);

export const validateReceipt = (receipt, env) => {
  assert.equal(receipt.source_sha, env.GITHUB_SHA);
  assert.equal(receipt.repository, "LioRael/lenso-console");
  assert.equal(env.GITHUB_REPOSITORY, receipt.repository);
  assert.equal(receipt.run_id, env.GITHUB_RUN_ID);
  assert.ok(
    Number(receipt.run_attempt) >= 1 &&
      Number(receipt.run_attempt) <= Number(env.GITHUB_RUN_ATTEMPT)
  );
  assert.equal(receipt.packages.length, owners.length);
  for (const [i, p] of receipt.packages.entries()) {
    assert.equal(p.name, owners[i][1]);
    assert.match(p.version, /^\d+\.\d+\.\d+$/u);
    assert.equal(
      p.filename,
      `${p.name.replace("@", "").replace("/", "-")}-${p.version}.tgz`
    );
    assert.match(p.sha256, /^[a-f0-9]{64}$/u);
  }
};

const root = fileURLToPath(new URL("../../", import.meta.url));
export const pack = (directory, env = process.env) => {
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim(),
    env.GITHUB_SHA
  );
  fs.mkdirSync(directory, { recursive: true });
  const packages = owners.map(([owner, name]) => {
    const cwd = path.join(root, "packages", owner);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(cwd, "package.json"))
    );
    assert.equal(manifest.name, name);
    assert.ok(!manifest.private);
    const filename = `${name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`;
    const archive = path.resolve(directory, filename);
    execFileSync(
      "bun",
      ["pm", "pack", "--ignore-scripts", "--quiet", "--filename", archive],
      { cwd }
    );
    const packed = JSON.parse(
      execFileSync("tar", ["-xOf", archive, "package/package.json"], {
        encoding: "utf-8",
      })
    );
    assert.equal(packed.name, name);
    assert.equal(packed.version, manifest.version);
    assert.equal(packed.license, "MIT");
    assert.equal(
      packed.repository.url,
      "git+https://github.com/LioRael/lenso-console.git"
    );
    assert.equal(packed.repository.directory, `packages/${owner}`);
    const files = execFileSync("tar", ["-tzf", archive], {
      encoding: "utf-8",
    }).split("\n");
    assert.ok(
      files.some((f) => f.startsWith("package/dist/")),
      `Missing build: ${name}`
    );
    if (name === "@lenso/console-sdk") {
      for (const file of [
        "shell/index.html",
        "compiler/compiler.mjs",
        "dist/index.js",
        "dist/index.d.ts",
      ]) {
        assert.ok(
          files.includes(`package/${file}`),
          `Missing SDK file: ${file}`
        );
      }
    }
    const bytes = fs.readFileSync(archive);
    return {
      filename,
      integrity: `sha512-${hash(bytes, "sha512", "base64")}`,
      name,
      sha256: hash(bytes),
      version: manifest.version,
    };
  });
  const receipt = {
    packages,
    repository: env.GITHUB_REPOSITORY,
    run_attempt: env.GITHUB_RUN_ATTEMPT,
    run_id: env.GITHUB_RUN_ID,
    source_sha: env.GITHUB_SHA,
  };
  validateReceipt(receipt, env);
  fs.writeFileSync(
    path.join(directory, "source.json"),
    JSON.stringify(receipt, null, 2)
  );
};

export const publish = async (directory, env = process.env) => {
  assert.ok(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
      env.GITHUB_REF === "refs/heads/main" &&
      env.RELEASE_PROTECTED_JOB === "npm" &&
      env.ACTIONS_ID_TOKEN_REQUEST_URL &&
      env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    "Only the protected main OIDC workflow may publish"
  );
  assert.ok(
    !env.NODE_AUTH_TOKEN && !env.NPM_TOKEN,
    "Token fallback is forbidden"
  );
  const receipt = JSON.parse(
    fs.readFileSync(path.join(directory, "source.json"))
  );
  validateReceipt(receipt, env);
  for (const p of receipt.packages) {
    const bytes = fs.readFileSync(path.join(directory, p.filename));
    assert.equal(hash(bytes), p.sha256);
    assert.equal(`sha512-${hash(bytes, "sha512", "base64")}`, p.integrity);
  }
  const exists = [];
  for (const p of receipt.packages) {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(p.name)}/${p.version}`
    );
    assert.ok(
      response.ok || response.status === 404,
      `Registry read: ${p.name} ${response.status}`
    );
    if (response.ok) {
      const metadata = await response.json();
      assert.equal(
        metadata.dist.integrity,
        p.integrity,
        `Existing version conflict: ${p.name}`
      );
      await waitForPackage(p);
      const archive = await fetch(metadata.dist.tarball);
      assert.ok(archive.ok);
      assert.equal(hash(Buffer.from(await archive.arrayBuffer())), p.sha256);
      exists.push(p.name);
    }
  }
  for (const p of receipt.packages) {
    if (exists.includes(p.name)) {
      console.log(
        `Already published identical archive: ${p.name}@${p.version}`
      );
    } else {
      execFileSync(
        "npm",
        [
          "publish",
          path.join(directory, p.filename),
          "--registry=https://registry.npmjs.org",
          "--access=public",
          "--tag=latest",
          "--provenance",
          "--ignore-scripts",
        ],
        { stdio: "inherit" }
      );
      console.log(`Submitted: ${p.name}@${p.version}`);
    }
  }
  for (const p of receipt.packages) {
    await waitForPackage(p);
    console.log(`Verified public installation: ${p.name}@${p.version}`);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [mode, directory, ...extra] = process.argv.slice(2);
  assert.ok(directory && !extra.length);
  if (mode === "pack") {
    pack(directory);
  } else if (mode === "publish") {
    await publish(directory);
  } else {
    throw new Error("Expected pack or publish mode");
  }
}
